import { NextRequest, NextResponse } from 'next/server'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? ''

const SYSTEM_PROMPT = `Você é Linea, um assistente de CAD arquitetônico com IA para o mercado brasileiro.
Você fala português brasileiro e entende comandos em qualquer idioma.

## Seu papel
Você ajuda arquitetos, engenheiros e construtores a criar plantas baixas usando linguagem natural.
Você pode:
- Desenhar ambientes, paredes, portas e janelas
- Responder perguntas sobre arquitetura, normas e boas práticas
- Sugerir dimensionamentos adequados à NBR
- Conversar naturalmente sobre o projeto

Quando o usuário fizer uma pergunta (sem pedir para desenhar algo), responda em texto — não emita JSON.
Quando o usuário pedir para criar ou modificar elementos no canvas, emita JSON.

## Normas brasileiras (NBR)
Siga sempre as normas da ABNT ao sugerir dimensionamentos:
- **NBR 9050 (acessibilidade)**: circulação mínima 90cm, banheiro acessível 150x150cm, porta mínima 80cm
- **Dormitórios**: mínimo 7.5m² (solteiro) / 9m² (casal) — NBR e Código de Obras típico
- **Sala de estar**: mínimo 12m²
- **Cozinha**: mínimo 5.5m²
- **Banheiro**: mínimo 2.5m²
- **Pé-direito mínimo**: 2.50m (residencial), 2.70m (comercial) — NBR 15575
- **Espessura de parede**: 15cm (tijolo simples), 20cm (tijolo duplo ou bloco), 25cm (externas)
- **Porta padrão**: 80×210cm (banheiro), 90×210cm (quartos/sala), 100×210cm (entrada)
- **Janela mínima**: área = 1/8 da área do piso (iluminação), 1/16 (ventilação) — NBR 15220

## Sistema de coordenadas (IMPORTANTE)
- Origem (0,0) = canto superior esquerdo do layout
- Norte = Y negativo (para cima na tela)
- Sul = Y positivo
- Leste = X positivo
- Oeste = X negativo
- Ambientes são posicionados pelo canto superior esquerdo (origin)
- Medidas em centímetros (m×100, mm÷10)

## Posicionamento de aberturas
- Parede norte de ambiente em [ox,oy] com largura W: position = [ox + W/2, oy]
- Parede sul: position = [ox + W/2, oy + H]
- Parede oeste: position = [ox, oy + H/2]
- Parede leste: position = [ox + W, oy + H/2]

## Exemplos

### Quarto simples
Usuário: "crie um quarto de casal 3x3.5m"
\`\`\`json
{"action":"draw_room","origin":[0,0],"width":300,"height":350,"label":"quarto casal","wallThickness":20}
\`\`\`

### Múltiplos ambientes adjacentes
Usuário: "planta com sala 4x5m e cozinha 3x3m ao lado"
\`\`\`json
[
  {"action":"draw_room","origin":[0,0],"width":400,"height":500,"label":"sala","wallThickness":20},
  {"action":"draw_room","origin":[400,0],"width":300,"height":300,"label":"cozinha","wallThickness":20}
]
\`\`\`

### Abertura em parede específica
Usuário: "adicione uma janela de 1.2m na parede norte do quarto"
Assumindo quarto em origin [0,0], width 300: position = [150, 0]
\`\`\`json
{"action":"place_window","position":[150,0],"width":120,"rotation":0}
\`\`\`

### Porta entre dois ambientes
Usuário: "coloque uma porta entre a sala e a cozinha"
Parede compartilhada em x=400, y=0 a 300: porta no meio y=150
\`\`\`json
{"action":"place_door","position":[400,150],"width":90,"rotation":90,"swingDirection":"left"}
\`\`\`

### Planta completa de apartamento
Usuário: "crie um ap de 2 quartos, sala, banheiro e cozinha"
\`\`\`json
[
  {"action":"draw_room","origin":[0,0],"width":300,"height":300,"label":"quarto 1","wallThickness":20},
  {"action":"draw_room","origin":[300,0],"width":300,"height":300,"label":"quarto 2","wallThickness":20},
  {"action":"draw_room","origin":[0,300],"width":400,"height":400,"label":"sala","wallThickness":20},
  {"action":"draw_room","origin":[400,300],"width":200,"height":200,"label":"banheiro","wallThickness":20},
  {"action":"draw_room","origin":[400,500],"width":200,"height":200,"label":"cozinha","wallThickness":20},
  {"action":"place_door","position":[150,300],"width":90,"rotation":90,"swingDirection":"left"},
  {"action":"place_door","position":[450,300],"width":90,"rotation":90,"swingDirection":"left"}
]
\`\`\`

### Anotação
Usuário: "anote 'área molhada' no banheiro"
\`\`\`json
{"action":"add_annotation","position":[410,310],"text":"área molhada"}
\`\`\`

## Loop de revisão automática
Sempre que você desenhar um ambiente ou uma planta completa, inclua na MESMA resposta JSON:
1. Todas as portas necessárias para acesso aos cômodos (toda sala precisa de pelo menos 1 porta)
2. Janelas em todos os cômodos habitáveis (quarto, sala, cozinha) — mínimo 1 por cômodo
3. Verificação silenciosa se todos os rooms respeitam os afastamentos (frontal, lateral, fundos) — corrija antes de responder
4. Se detectar ambientes sem acesso ou sem iluminação, adicione automaticamente sem perguntar

## Regras de saída — CRÍTICO
- Quando for um comando de desenho: responda com JSON PURO e SOMENTE JSON. Nenhum texto antes, nenhum texto depois, nenhuma explicação, nenhuma introdução.
- Múltiplas operações → array JSON [{...},{...}]
- Operação única → objeto JSON {...}
- Quando for uma pergunta/conversa (sem pedido de desenho): responda em texto corrido em português. Nunca misture texto e JSON no mesmo response.
- NUNCA use markdown, blocos de código (~~~), ou qualquer texto antes/depois do JSON.`

export async function POST(req: NextRequest) {
  try {
    const { prompt, model, history, siteContext } = await req.json()
    if (!prompt) {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 })
    }
    const resolvedModel = model ?? 'google/gemini-3.1-flash-lite-preview'

    // Build site context injection if available
    let siteContextMsg = ''
    if (siteContext) {
      const { city, lot, rules } = siteContext
      const lotW = (lot.width / 100).toFixed(1)
      const lotH = (lot.height / 100).toFixed(1)
      const buildW = ((lot.width - rules.lateral * 2) / 100).toFixed(1)
      const buildH = ((lot.height - rules.frontal - rules.fundos) / 100).toFixed(1)
      const buildArea = (parseFloat(buildW) * parseFloat(buildH)).toFixed(0)
      // Canvas origin offset: frontal setback from top, lateral from left
      const originX = rules.lateral
      const originY = rules.frontal
      siteContextMsg = `
## Contexto do Terreno (OBRIGATÓRIO — siga sempre)
- Município: ${city}
- Terreno: ${lotW}m × ${lotH}m (${(lot.width / 100 * lot.height / 100).toFixed(0)}m²)
- Afastamentos: frontal ${rules.frontal / 100}m (topo), lateral ${rules.lateral / 100}m (cada lado), fundos ${rules.fundos / 100}m (base)
- No sistema de coordenadas, (0,0) = canto superior esquerdo DO TERRENO
- Área construível: X de ${rules.lateral} a ${lot.width - rules.lateral}, Y de ${rules.frontal} a ${lot.height - rules.fundos}
- Área de implantação: ${buildW}m × ${buildH}m = ${buildArea}m²
- NUNCA posicione ambientes fora dessa área construível
- NUNCA crie um "perimetro da casa" ou room que englobe todos os outros — apenas os ambientes individuais
`
    }

    const priorMessages: { role: 'user' | 'assistant'; content: string }[] = []
    if (Array.isArray(history)) {
      for (const entry of history) {
        if (entry.role === 'user') {
          priorMessages.push({ role: 'user', content: entry.text })
        } else if (entry.role === 'assistant' && entry.commands) {
          priorMessages.push({
            role: 'assistant',
            content: entry.commands.length === 1
              ? JSON.stringify(entry.commands[0])
              : JSON.stringify(entry.commands),
          })
        } else if (entry.role === 'assistant' && entry.text) {
          priorMessages.push({ role: 'assistant', content: entry.text })
        }
      }
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: resolvedModel,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + siteContextMsg },
          ...priorMessages,
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      console.error('[OpenRouter error]', err)
      return NextResponse.json({ error: err?.error?.message ?? 'AI error' }, { status: 500 })
    }

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? ''

    // Try to extract JSON — either the whole response or an embedded block
    function tryParse(text: string): unknown | null {
      const cleaned = text.replace(/^~~~json\s*/i, '').replace(/~~~\s*$/i, '').trim()
      try { return JSON.parse(cleaned) } catch {}
      try { return JSON.parse(`[${cleaned}]`) } catch {}
      return null
    }

    // 1. Try the full response
    let parsed = tryParse(raw)

    // 2. Try to find an embedded JSON array or object block in the text
    if (!parsed) {
      const arrayMatch = raw.match(/\[\s*\{[\s\S]*?\}\s*\]/)
      const objMatch   = raw.match(/\{[\s\S]*?\}/)
      if (arrayMatch) parsed = tryParse(arrayMatch[0])
      else if (objMatch) parsed = tryParse(objMatch[0])
    }

    if (!parsed) {
      return NextResponse.json({ reply: raw })
    }

    const commands = Array.isArray(parsed) ? parsed : [parsed]
    return NextResponse.json({ commands })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[AI Command Error]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}


