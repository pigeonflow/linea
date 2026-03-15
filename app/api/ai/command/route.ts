import { NextRequest, NextResponse } from 'next/server'
import { createOpenAI } from '@ai-sdk/openai'
import { streamText, tool, stepCountIs, type ToolSet } from 'ai'
import { z } from 'zod'
import { join } from 'path'
import { readFileSync } from 'fs'
import { validateLayout, ValidationInput } from '@/lib/cad/validateLayout'
import { computePosition, wallCenter } from '@/lib/cad/computePosition'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? ''

// ─── Agent event types (SSE) ───────────────────────────────────────────────

export type AgentEvent =
  | { type: 'thinking';    text: string }
  | { type: 'tool_call';   name: string; args: Record<string, unknown>; callId: string; isError?: boolean }
  | { type: 'tool_result'; name: string; callId: string; result: unknown; isError: boolean }
  | { type: 'draw';        command: Record<string, unknown> }
  | { type: 'done';        reply: string; drawCount: number }
  | { type: 'error';       message: string }

interface DrawCommand { action: string; [key: string]: unknown }
type SiteCtx = { city: string; lot: { width: number; height: number }; rules: { lateral: number; frontal: number; fundos: number } }

// ─── System prompt ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Voce é Linea. Voce nao é apenas uma assistente, voce é uma especialista em projetar plantas baixas e layouts arquitetonicos. Seu trabalho é criar plantas baixas otimizadas, funcionais e que atendam as necessidades dos usuarios, respeitando as normas brasileiras de construção civil (NBR 9050, NBR 15575, NBR 15220) e os codigos municipais de obras.
Idioma: portugues brasileiro. Aceita comandos em qualquer idioma.

## Regra de ouro: DESENHE, nao pergunte
Quando o usuario pedir um layout, planta, ambiente ou projeto - DESENHE IMEDIATAMENTE.
Tome decisoes de projeto por conta propria com bom senso arquitetonico.
Se for uma pergunta pura sobre normas, medidas ou conceitos (sem pedido de planta): chame consultar_normas (se necessario) e depois chame respond() com a resposta completa.

## REGRA CRITICA: Sem texto intermediario
Enquanto estiver executando um projeto (apos receber um pedido de planta), NUNCA produza respostas de texto intermediarias entre chamadas de ferramentas.
Cada step deve chamar UMA OU MAIS ferramentas. Textos como "Agora vou desenhar...", "Ok, tenho as normas..." ou "Vou verificar o terreno..." sao PROIBIDOS no meio do fluxo.
Continue chamando ferramentas em sequencia (get_terrain_limits → compute_position → draw_room → ...) sem pausas textuais.
Somente produza texto na resposta FINAL, depois de validate_layout.

## Antes de comecar: consulte o terreno
SEMPRE chame get_terrain_limits antes de posicionar qualquer comodo.
Isso retorna os limites exatos da area construivel - voce NAO pode ultrapassar esses limites.

## Fluxo para criar uma planta (SIGA EXATAMENTE)
Passo 1 - Limites:
  - Chame get_terrain_limits para obter buildX1, buildX2, buildY1, buildY2
  - NENHUM comodo pode ter origin ou extremidade fora desses limites

Passo 2 - Planejamento (Plan Mode):
  - Calcule a area construivel disponivel (Sempre considerando os afastamentos)
  - Liste comodos e dimensione para caber na area construivel
  - Some as dimensoes para garantir que tudo cabe antes de desenhar
  - Planeje as tarefas de desenho em ordem logica (ex: draw_room antes de place_door, e comodos mais centrais antes de perifericos)

Passo 3 - Posicionamento:
  - Ancora (primeiro comodo): origin = [buildX1, buildY1] — NUNCA use coordenadas arbitrarias
  - Cada comodo seguinte: chame compute_position com o vizinho ja posicionado (adjacent_east, adjacent_south, etc)
  - NAO pule compute_position — calcule TODA origin via compute_position a partir do anchor ou de outro comodo ja desenhado
  - compute_position retorna warning se fora dos limites — nesse caso mude relation ou reduza dimensoes
  - Caso coloque um comodo fora dos limites, delete_element + compute_position diferente + draw_room apenas o problemático

Passo 4 - Desenho:
  - draw_room para TODOS os comodos
  - place_door para todas as portas (minimo 1 por comodo)
  - place_window para todos os comodos habitaveis
  - Obtenha position via wall_center antes de cada place_door/place_window
  - Pense na planta baixa como um todo, nao comodos isolados.

Passo 5 - Validacao:
  - validate_layout com todos os comodos + portas + janelas
  - Se erros: delete_element + corrija origin + draw_room apenas o problemático
  - Quando tudo estiver correto: chame finish_project com um resumo do projeto

## PROIBICOES ABSOLUTAS
- Pular get_terrain_limits (sempre consulte primeiro)
- Calcular origin manualmente sem compute_position
- Usar coordenadas hardcoded arbitrarias em vez de compute_position
- origin fora dos limites retornados por get_terrain_limits
- delete_element de comodo que voce acabou de desenhar (nuke loop)
- clear_canvas no meio de uma criacao
- Redesenhar comodos que ja foram desenhados (cada label so aparece uma vez)

## Normas
- Use a skill de normas brasileiras para consultar requisitos de area minima, iluminacao, ventilacao, acessibilidade, etc.

## Coordenadas
- (0,0) = canto superior esquerdo do terreno
- X+ = leste, Y+ = sul | Medidas em cm (3m=300)
- wall_center retorna posicao para portas/janelas

## REGRA FINAL OBRIGATÓRIA
Voce SEMPRE deve terminar com uma resposta de texto ao usuario. Nunca termine sem escrever nada.
- Apos desenhar: escreva um resumo (ex: "Criei o layout com sala, 2 quartos e banheiro — total 60m².")
- Apos consultar normas: escreva a resposta completa ao usuario.
- Nunca retorne resposta vazia.`

// ─── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const { prompt, model, history, siteContext, canvasState, canvasImage } = body as {
    prompt?: string; model?: string; history?: unknown[]; siteContext?: unknown
    canvasState?: unknown; canvasImage?: string | null
  }
  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

  const resolvedModel = model === 'auto' || !model ? 'google/gemini-2.5-flash-lite' : model

  // Models known to support vision (image input)
  const VISION_MODELS = new Set([
    'google/gemini-2.5-flash-lite',
    'google/gemini-2.5-flash',
    'google/gemini-2.0-flash',
    'google/gemini-flash-1.5',
    'google/gemini-pro-1.5',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/gpt-4-vision-preview',
    'anthropic/claude-3-5-sonnet',
    'anthropic/claude-3-5-haiku',
    'anthropic/claude-3-opus',
    'anthropic/claude-3-sonnet',
    'anthropic/claude-3-haiku',
  ])
  const modelSupportsVision = VISION_MODELS.has(resolvedModel)

  // Build system context addendum
  let siteContextMsg = ''
  if (siteContext) {
    const { city, lot, rules } = siteContext as SiteCtx
    const bx1 = rules.lateral, bx2 = lot.width - rules.lateral
    const by1 = rules.frontal, by2 = lot.height - rules.fundos
    const bwm = ((bx2-bx1)/100).toFixed(1), bhm = ((by2-by1)/100).toFixed(1)
    siteContextMsg = `\n\n## CONTEXTO DO TERRENO\n- Município: ${city}\n- Terreno: ${(lot.width/100).toFixed(1)}m × ${(lot.height/100).toFixed(1)}m\n- Afastamentos: frontal ${rules.frontal/100}m | lateral ${rules.lateral/100}m | fundos ${rules.fundos/100}m\n- Área construível (cm): X ${bx1}–${bx2}, Y ${by1}–${by2} = ${bwm}m × ${bhm}m\n- Âncora: origin = [${bx1}, ${by1}]\n- NENHUM cômodo fora desses limites`
  } else {
    siteContextMsg = `\n\n## Terreno\nNão configurado. Use 10×20m, coordenadas positivas.`
  }

  let canvasStateMsg = ''
  if (canvasState) {
    const cs = canvasState as Record<string, unknown>
    const rooms = cs.rooms as Record<string, unknown>[] | undefined
    const doors = cs.doors as unknown[] | undefined
    if (rooms?.length || doors?.length) {
      canvasStateMsg = `\n\n## Canvas atual\n`
      canvasStateMsg += `Ambientes: ${rooms?.map(r => `${r.label} ${r.width}x${r.height}cm@[${(r.origin as number[])?.join(',')}]`).join('; ') || 'nenhum'}\n`
      canvasStateMsg += `Portas: ${doors?.length ?? 0} | Janelas: ${(cs.windows as unknown[])?.length ?? 0}`
    }
  }

  // Build message history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = []
  if (Array.isArray(history)) {
    for (const e of history as { role: string; text?: string }[]) {
      if (e.role === 'user') messages.push({ role: 'user', content: e.text })
      else if (e.role === 'assistant') messages.push({ role: 'assistant', content: e.text ?? '' })
    }
  }

  // Build current user message (with optional canvas image — only if model supports vision)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userContent: any = (canvasImage && modelSupportsVision)
    ? [{ type: 'text', text: prompt }, { type: 'image', image: canvasImage.startsWith('data:') ? canvasImage.split(',')[1] : canvasImage, mimeType: 'image/png' }]
    : prompt

  // ─── Shared draw state (accumulates across tool calls) ──────────────────
  const drawCommands: DrawCommand[] = []
  let wallCenterCount = 0
  const MAX_WALL_CENTER = 30

  // ─── SSE encoder setup ──────────────────────────────────────────────────
  const encoder = new TextEncoder()
  let controller!: ReadableStreamDefaultController<Uint8Array>

  const sseStream = new ReadableStream<Uint8Array>({
    start(c) { controller = c },
  })

  const emit = (event: AgentEvent) => {
    try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) } catch { /* disconnected */ }
  }

  // ─── Normas skill (reads markdown references directly) ─────────────────
  const skillTools: Record<string, unknown> = {
    finish_project: tool({
      description: `Chame esta ferramenta quando o projeto estiver COMPLETO — todos os cômodos desenhados, portas e janelas posicionadas, e validate_layout executado. Ela sinaliza o fim do fluxo de desenho e libera a resposta final ao usuário.`,
      inputSchema: z.object({
        summary: z.string().describe('Resumo do que foi criado (cômodos, dimensões, área total)'),
      }),
      execute: async ({ summary }) => ({ done: true, summary }),
    }),
    consultar_normas: tool({
      description: `Consulta as normas técnicas brasileiras de construção civil (NBR 9050, NBR 15575, NBR 15220, códigos municipais).
Use quando precisar verificar áreas mínimas, pé-direito, acessibilidade, ventilação, iluminação, ou qualquer requisito normativo.`,
      inputSchema: z.object({
        norma: z.enum(['nbr9050', 'nbr15575', 'nbr15220', 'codigos_municipais'])
          .describe('nbr9050=acessibilidade, nbr15575=desempenho/dimensões mínimas, nbr15220=desempenho térmico, codigos_municipais=recuos/TO/CA'),
        consulta: z.string().describe('O que você quer verificar (ex: "área mínima quarto casal")'),
      }),
      execute: async ({ norma }) => {
        const normaMap: Record<string, string> = {
          nbr9050: 'nbr9050.md', nbr15575: 'nbr15575.md',
          nbr15220: 'nbr15220.md', codigos_municipais: 'codigos_municipais.md',
        }
        try {
          const skillsDir = join(process.cwd(), 'app', 'api', 'ai', 'skills', 'normas-brasileiras-construcao', 'references')
          const content = readFileSync(join(skillsDir, normaMap[norma]), 'utf-8')
          return { norma, conteudo: content.length > 4000 ? content.slice(0, 4000) + '\n\n[...truncado]' : content }
        } catch (e) {
          return { error: `Não foi possível ler a norma: ${String(e)}` }
        }
      },
    }),
  }

  // ─── Build tools object ─────────────────────────────────────────────────

  const sc = siteContext as SiteCtx | null

  const cadTools = {
    get_terrain_limits: tool({
      description: `Retorna os limites exatos da área construível do terreno em cm.
SEMPRE chame esta ferramenta ANTES de posicionar qualquer cômodo.
Retorna buildX1, buildX2, buildY1, buildY2 — origin e extremidades de todos os cômodos devem ficar dentro desses limites.`,
      inputSchema: z.object({}),
      execute: async () => {
        if (!sc) {
          return { buildX1: 0, buildX2: 1000, buildY1: 0, buildY2: 2000, message: 'Terreno padrão 10×20m — configure o terreno para limites reais.' }
        }
        const { lot, rules } = sc
        const bx1 = rules.lateral, bx2 = lot.width - rules.lateral
        const by1 = rules.frontal, by2 = lot.height - rules.fundos
        return {
          buildX1: bx1, buildX2: bx2, buildY1: by1, buildY2: by2,
          buildableWidth: bx2 - bx1, buildableHeight: by2 - by1,
          message: `Área construível: X ${bx1}–${bx2} (${((bx2-bx1)/100).toFixed(1)}m), Y ${by1}–${by2} (${((by2-by1)/100).toFixed(1)}m). Âncora: [${bx1},${by1}].`,
        }
      },
    }),

    draw_room: tool({
      description: `Cria um ambiente retangular no canvas (quarto, sala, cozinha, banheiro, varanda, piscina, etc.).
IMPORTANTE: A origin deve vir do retorno de compute_position, NAO ser calculada manualmente.
Excecao: o primeiro comodo (ancora) usa origin = [buildX1, buildY1] retornado por get_terrain_limits.
Cada comodo deve ser chamado UMA VEZ. Nao repita comodos.`,
      inputSchema: z.object({
        origin: z.array(z.number()).length(2).describe('[x, y] em cm. Deve vir de compute_position ou get_terrain_limits.'),
        width: z.number().describe('Largura (eixo X) em cm.'),
        height: z.number().describe('Profundidade (eixo Y) em cm.'),
        label: z.string().describe('Nome em portugues minusculo.'),
        wallThickness: z.number().optional().describe('Espessura em cm. 15=divisoria, 20=padrao, 25=externa. Padrao: 20.'),
      }),
      execute: async ({ origin, width, height, label, wallThickness }) => {
        const wt = wallThickness ?? 20
        const [ox, oy] = origin as [number, number]
        const rx2 = ox + width, ry2 = oy + height

        // Guard: duplicate
        const alreadyDrawn = drawCommands.filter(c => c.action === 'draw_room').map(c => (c.label as string ?? '').toLowerCase())
        if (alreadyDrawn.includes(label.toLowerCase())) {
          return { error: `"${label}" já foi desenhado nesta rodada. Não repita o mesmo cômodo. Prossiga para o próximo.` }
        }

        // Guard: out-of-bounds
        if (sc) {
          const { lot, rules } = sc
          const bx1 = rules.lateral, bx2 = lot.width - rules.lateral
          const by1 = rules.frontal, by2 = lot.height - rules.fundos
          if (ox < bx1 || oy < by1 || rx2 > bx2 || ry2 > by2) {
            const hints: string[] = []
            if (ox < bx1) hints.push(`X mínimo é ${bx1} — use adjacent_east ou ajuste a referência`)
            if (rx2 > bx2) hints.push(`X máximo é ${bx2} — use adjacent_west com referência mais ao centro, ou reduza width`)
            if (oy < by1) hints.push(`Y mínimo é ${by1} — use adjacent_south`)
            if (ry2 > by2) hints.push(`Y máximo é ${by2} — use adjacent_north, ou reduza height`)
            return { error: `"${label}" FORA DA ÁREA CONSTRUÍVEL. origin=[${ox},${oy}] +${width}x${height} → extremidade=[${rx2},${ry2}]. Limites X:${bx1}–${bx2} Y:${by1}–${by2}. ${hints.join('; ')}` }
          }
        }

        // Guard: overlap
        const existing = (drawCommands.filter(c => c.action === 'draw_room' && c.origin) as unknown) as Array<{ origin: [number,number]; width: number; height: number; label?: string; wallThickness?: number }>
        const ov = existing.find(r => {
          const S = Math.max((r.wallThickness ?? 20), wt) + 2
          return !(rx2 <= r.origin[0]+S || ox >= r.origin[0]+r.width-S || ry2 <= r.origin[1]+S || oy >= r.origin[1]+r.height-S)
        })
        if (ov) {
          return { error: `"${label}" sobrepõe "${ov.label}". Use compute_position para calcular a origin correta.` }
        }

        drawCommands.push({ action: 'draw_room', origin, width, height, label, wallThickness: wt })
        emit({ type: 'draw', command: { action: 'draw_room', origin, width, height, label, wallThickness: wt } })
        return { ok: true, message: `Ambiente "${label}" desenhado em [${ox},${oy}], ${width}x${height}cm.` }
      },
    }),

    place_door: tool({
      description: `Coloca uma porta no centro de uma parede.
FLUXO: Chame wall_center primeiro para obter position. Todo comodo habitavel precisa de 1 porta.`,
      inputSchema: z.object({
        position: z.array(z.number()).length(2).describe('[x, y] centro da porta. Obtido via wall_center.'),
        width: z.number().describe('80=banheiro, 90=quarto/sala, 100=entrada.'),
        rotation: z.number().describe('0=parede norte/sul, 90=parede leste/oeste.'),
        swingDirection: z.enum(['left', 'right']),
      }),
      execute: async (args) => {
        drawCommands.push({ action: 'place_door', ...args })
        emit({ type: 'draw', command: { action: 'place_door', ...args } })
        return { ok: true, message: `Porta colocada em [${(args.position as number[]).join(',')}], largura ${args.width}cm.` }
      },
    }),

    place_window: tool({
      description: `Coloca uma janela numa parede.
FLUXO: Chame wall_center primeiro. Comodos habitaveis exigem janela (NBR 15220, area >= 1/8 do piso).`,
      inputSchema: z.object({
        position: z.array(z.number()).length(2).describe('[x, y] via wall_center.'),
        width: z.number().describe('Largura em cm. Minimo 100cm, usual 120-200cm.'),
        rotation: z.number().describe('0=parede norte/sul, 90=parede leste/oeste.'),
      }),
      execute: async (args) => {
        drawCommands.push({ action: 'place_window', ...args })
        emit({ type: 'draw', command: { action: 'place_window', ...args } })
        return { ok: true, message: `Janela colocada em [${(args.position as number[]).join(',')}], largura ${args.width}cm.` }
      },
    }),

    add_annotation: tool({
      description: 'Adiciona texto no canvas (notas, cotas, orientacao).',
      inputSchema: z.object({
        position: z.array(z.number()).length(2).describe('[x, y] em cm'),
        text: z.string(),
      }),
      execute: async (args) => {
        drawCommands.push({ action: 'add_annotation', ...args })
        emit({ type: 'draw', command: { action: 'add_annotation', ...args } })
        return { ok: true }
      },
    }),

    validate_layout: tool({
      description: `Verifica a planta contra NBR. Chame apos criar todos os comodos, portas e janelas.
Retorna violacoes. Se houver erros, corrija com delete_element + draw_room e revalide.`,
      inputSchema: z.object({
        rooms: z.array(z.object({
          label: z.string(), origin: z.array(z.number()), width: z.number(), height: z.number(),
        })).describe('Todos os comodos'),
        doors: z.array(z.object({ position: z.array(z.number()), width: z.number() })).optional(),
        windows: z.array(z.object({ position: z.array(z.number()) })).optional(),
      }),
      execute: async ({ rooms, doors, windows }) => {
        const input: ValidationInput = {
          rooms: (rooms as unknown) as ValidationInput['rooms'],
          doors: ((doors ?? []) as unknown) as ValidationInput['doors'],
          windows: ((windows ?? []) as unknown) as ValidationInput['windows'],
          siteContext: sc as ValidationInput['siteContext'],
        }
        const violations = validateLayout(input)
        if (violations.length === 0) return { ok: true, message: 'Layout válido.' }
        return { ok: false, violations: violations.map(v => `[${v.severity.toUpperCase()}] ${v.message}`), message: `${violations.length} problema(s). Corrija antes de continuar.` }
      },
    }),

    compute_position: tool({
      description: `Calcula a origin [x,y] exata para posicionar um novo comodo adjacente a outro ja desenhado.
SEMPRE use esta ferramenta em vez de calcular manualmente.
Retorna: { "origin": [x, y] } — use diretamente em draw_room.
Se retornar "warning", mude a relation ou reduza as dimensoes antes de chamar draw_room.`,
      inputSchema: z.object({
        referenceRoom: z.object({
          origin: z.array(z.number()), width: z.number(), height: z.number(), wallThickness: z.number().optional(),
        }).describe('O comodo vizinho ja desenhado'),
        relation: z.enum(['adjacent_east', 'adjacent_west', 'adjacent_north', 'adjacent_south'])
          .describe('adjacent_east=direita, adjacent_south=abaixo, adjacent_west=esquerda, adjacent_north=acima.'),
        elementWidth: z.number().optional().describe('Largura do novo comodo'),
        elementHeight: z.number().optional().describe('Altura do novo comodo'),
      }),
      execute: async ({ referenceRoom, relation, elementWidth, elementHeight }) => {
        const result = computePosition({
          referenceRoom: (referenceRoom as unknown) as Parameters<typeof computePosition>[0]['referenceRoom'],
          relation, elementWidth, elementHeight,
        })
        if (!sc) return result

        const { lot, rules } = sc
        const bx1 = rules.lateral, bx2 = lot.width - rules.lateral
        const by1 = rules.frontal, by2 = lot.height - rules.fundos
        const [ox, oy] = result.origin
        const ew = elementWidth ?? 300, eh = elementHeight ?? 300
        const warnings: string[] = []
        if (ox < bx1) warnings.push(`origin X=${ox} < mín ${bx1}`)
        if (ox + ew > bx2) warnings.push(`origin X=${ox}+${ew}=${ox+ew} > máx ${bx2}`)
        if (oy < by1) warnings.push(`origin Y=${oy} < mín ${by1}`)
        if (oy + eh > by2) warnings.push(`origin Y=${oy}+${eh}=${oy+eh} > máx ${by2}`)
        if (warnings.length > 0) {
          return { ...result, warning: `⚠️ FORA DA ÁREA CONSTRUÍVEL: ${warnings.join('; ')}. Escolha uma relation diferente ou reduza as dimensões.` }
        }
        return result
      },
    }),

    wall_center: tool({
      description: `Retorna a posicao central [x,y] de uma parede de um comodo.
SEMPRE use antes de place_door ou place_window.
IMPORTANTE: o campo "room" deve ter as dimensoes COMPLETAS do comodo (ex: width:400, height:300).
NUNCA passe width:20 ou height:20 — isso e a espessura da parede, nao o comodo.`,
      inputSchema: z.object({
        room: z.object({
          origin: z.array(z.number()), width: z.number(), height: z.number(),
        }).describe('O comodo onde sera colocada a porta/janela'),
        wall: z.enum(['north', 'south', 'east', 'west']).describe('north=topo, south=base, west=esquerda, east=direita.'),
      }),
      execute: async ({ room, wall }) => {
        wallCenterCount++
        if (room.width < 50 || room.height < 50) {
          return { error: `wall_center recebeu dimensões inválidas (${room.width}x${room.height}). Passe o cômodo completo, não a espessura da parede.` }
        }
        if (wallCenterCount > MAX_WALL_CENTER) {
          return { error: `Muitas chamadas de wall_center (${wallCenterCount}). Use as posições já calculadas e chame place_door/place_window diretamente.` }
        }
        return wallCenter((room as unknown) as Parameters<typeof wallCenter>[0], wall)
      },
    }),

    delete_element: tool({
      description: 'Remove um elemento do canvas pelo label. Use para corrigir erros sem redesenhar tudo.',
      inputSchema: z.object({
        label: z.string().describe('Label do ambiente a remover'),
      }),
      execute: async ({ label }) => {
        // Guard: nuke loop
        const drawn = drawCommands.filter(c => c.action === 'draw_room').map(c => (c.label as string ?? '').toLowerCase())
        if (drawn.includes(label.toLowerCase())) {
          return { error: 'Proibido: não pode deletar um cômodo que você acabou de desenhar. Use compute_position para corrigir a origin.' }
        }
        drawCommands.push({ action: 'delete_element', label })
        emit({ type: 'draw', command: { action: 'delete_element', label } })
        return { ok: true, message: `Elemento "${label}" removido.` }
      },
    }),

    clear_canvas: tool({
      description: 'Remove TODOS os elementos do canvas. Use APENAS quando o usuario pedir para comecar do zero.',
      inputSchema: z.object({}),
      execute: async () => {
        drawCommands.push({ action: 'clear_canvas' })
        emit({ type: 'draw', command: { action: 'clear_canvas' } })
        return { ok: true, message: 'Canvas limpo.' }
      },
    }),
  }

  // ─── AI SDK provider (OpenRouter) ───────────────────────────────────────
  const openrouter = createOpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
  })

  // Force chat completions path (not Responses API)
  const languageModel = openrouter.chat(resolvedModel)

  // ─── Run agent (async, feeds SSE) ───────────────────────────────────────
  ;(async () => {
    try {
      const result = streamText({
        model: languageModel,
        system: SYSTEM_PROMPT + siteContextMsg + canvasStateMsg,
        messages: [...messages, { role: 'user', content: userContent }],
        tools: { ...cadTools, ...skillTools } as ToolSet,
        maxOutputTokens: 4096,
        stopWhen: stepCountIs(50),
        prepareStep: async ({ stepNumber }) => {
          if (stepNumber >= 48) return { toolChoice: 'auto' }
          return { toolChoice: 'auto' }
        },
        onStepFinish: async ({ stepNumber, text, toolCalls, toolResults }) => {
          // Emit thinking for text steps
          if (text) {
            emit({ type: 'thinking', text })
          }
          const DRAW_TOOLS = new Set(['draw_room', 'place_door', 'place_window', 'delete_element', 'clear_canvas', 'add_annotation'])
          if (toolCalls) {
            for (let i = 0; i < toolCalls.length; i++) {
              const tc = toolCalls[i]
              const input = (tc as unknown as { input: Record<string, unknown> }).input
              const tr = toolResults?.[i]
              const out = tr ? (tr as unknown as { output: unknown }).output : undefined
              const isError = typeof out === 'object' && out !== null && 'error' in out

              if (DRAW_TOOLS.has(tc.toolName)) {
                // For draw tools: only emit tool_call when there's an error (success shown via draw event)
                if (isError) {
                  emit({ type: 'tool_call', name: tc.toolName, args: input, callId: tc.toolCallId, isError: true })
                  emit({ type: 'tool_result', name: tr!.toolName, callId: tr!.toolCallId, result: out, isError: true })
                }
                continue
              }
              emit({ type: 'tool_call', name: tc.toolName, args: input, callId: tc.toolCallId })
              if (tr) {
                emit({ type: 'tool_result', name: tr.toolName, callId: tr.toolCallId, result: out, isError })
              }
            }
          }
          void stepNumber // suppress unused warning
        },
      })

      // Consume the full stream (drives tool calls and all steps)
      let finalText = ''
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') finalText += (part as unknown as { text: string }).text
        if (part.type === 'tool-result') {
          const p = part as unknown as { toolName: string; output: { summary?: string } }
          if (p.toolName === 'finish_project' && p.output?.summary && !finalText) finalText = p.output.summary
        }
      }

      emit({ type: 'done', reply: finalText, drawCount: drawCommands.filter(c => c.action === 'draw_room').length })
    } catch (err) {
      emit({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      controller.close()
    }
  })()

  return new Response(sseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
