'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { CADCommand } from '@/lib/cad/commands'
import { SiteContext } from './VizinhoPanel'
import { CanvasState } from '@/lib/cad/serializeCanvas'
import type { AgentEvent } from '@/app/api/ai/command/route'

// ── Agent run types ─────────────────────────────────────────────────────────
interface AgentStep {
  id: string
  type: 'thinking' | 'tool_call' | 'draw' | 'error'
  name?: string
  callId?: string
  text?: string
  args?: Record<string, unknown>
  result?: unknown
  isError?: boolean
  label?: string   // for draw steps
}

interface AgentRun {
  steps: AgentStep[]
  done: boolean
  reply: string
  drawCount: number
  collapsed: boolean
}

// ── Message types ───────────────────────────────────────────────────────────
type MessageRole = 'user' | 'assistant' | 'error' | 'agent_run'
interface Message {
  id: string
  role: MessageRole
  text: string
  agentRun?: AgentRun
  commands?: CADCommand[]
}

interface Props {
  onCommands: (commands: CADCommand[]) => void
  onStreamCommand?: (cmd: Record<string, unknown>) => void
  onStreamDone?: () => void
  siteContext?: SiteContext | null
  getCanvasState?: () => CanvasState | null
  getCanvasImage?: () => Promise<string | null>
}

const MODELS = [
  { id: 'auto',                                    label: 'Auto',             badge: 'free', vision: true,  tools: true  },
  { id: 'openrouter/hunter-alpha',                 label: 'Hunter Alpha',     badge: 'free', vision: true,  tools: true  },
  { id: 'google/gemini-2.0-flash-001',             label: 'Gemini 2.0 Flash', badge: '',     vision: true,  tools: true  },
  { id: 'google/gemini-2.5-pro-preview',           label: 'Gemini 2.5 Pro',   badge: '',     vision: true,  tools: true  },
  { id: 'anthropic/claude-sonnet-4.6',             label: 'Claude Sonnet',    badge: '',     vision: true,  tools: true  },
  { id: 'anthropic/claude-3.7-sonnet',             label: 'Claude 3.7',       badge: 'best', vision: true,  tools: true  },
  { id: 'openai/gpt-4o',                           label: 'GPT-4o',           badge: '',     vision: true,  tools: true  },
  { id: 'openai/gpt-4o-mini',                      label: 'GPT-4o Mini',      badge: '',     vision: false, tools: false },
]

const AUTO_MODEL_ID = 'openrouter/hunter-alpha'

const EXAMPLES = [
  'Crie uma casa de praia com 3 quartos',
  'Adicione uma porta de 90cm na parede norte',
  'Adicione uma janela de 120cm',
  'Desenhe uma sala integrada com cozinha',
  'Comece do zero',
]

// ── Agent Run View ──────────────────────────────────────────────────────────
function AgentRunView({ run, onToggle }: { run: AgentRun; onToggle: () => void }) {
  const STEP_ICON: Record<string, string> = {
    thinking: '💭', tool_call: '⚙️', draw: '✏️', error: '⚠️',
  }

  // Natural language descriptions for tool calls
  const toolLabel = (name: string, args?: Record<string, unknown>): string => {
    switch (name) {
      case 'get_terrain_limits':   return 'Analisando os recuos e área construível…'
      case 'compute_position': {
        const rel = String(args?.relation ?? '').replace('adjacent_', '')
        const ref = (args?.referenceRoom as Record<string,unknown>)
        const refLabel = ref?.label ? ` de ${ref.label}` : ''
        return `Calculando posição ${rel}${refLabel}…`
      }
      case 'draw_room': {
        const lbl = String(args?.label ?? '')
        const w = args?.width ? `${args.width}×${args.height}cm` : ''
        return `Desenhando ${lbl}${w ? ` (${w})` : ''}…`
      }
      case 'place_door':           return `Colocando porta em [${(args?.position as number[])?.join(', ')}]…`
      case 'place_window':         return `Colocando janela em [${(args?.position as number[])?.join(', ')}]…`
      case 'wall_center':          return `Localizando parede ${String(args?.wall ?? '')} de ${String((args?.room as Record<string,unknown>)?.label ?? '')}…`
      case 'validate_layout':      return 'Verificando normas técnicas (NBR)…'
      case 'delete_element':       return `Removendo "${String(args?.label ?? '')}"…`
      case 'clear_canvas':         return 'Limpando o canvas…'
      case 'consultar_normas':     return `Consultando ${String(args?.norma ?? '')}…`
      case 'add_annotation':       return `Adicionando anotação "${String(args?.text ?? '').slice(0, 30)}"…`
      default:                     return name
    }
  }

  const DRAW_TOOL_LABELS: Record<string, string> = {
    draw_room: 'room', place_door: 'door', place_window: 'window',
    add_annotation: 'note', delete_element: 'delete', clear_canvas: 'clear',
  }

  return (
    <div style={{
      width: '100%', background: '#f7f7fc', borderRadius: 10,
      border: '1px solid #e8e8f0', overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', padding: '8px 12px', cursor: 'pointer',
          fontSize: 12, color: '#555',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>✦</span>
          {run.done
            ? run.drawCount > 0
              ? `Desenhou ${run.drawCount} elemento${run.drawCount > 1 ? 's' : ''}`
              : (run.reply ? run.reply.slice(0, 60) : 'Concluído')
            : <span style={{ opacity: 0.6 }}>processando…</span>
          }
        </span>
        <span style={{ fontSize: 10, opacity: 0.5 }}>{run.collapsed ? '▸' : '▾'}</span>
      </button>

      {/* Steps */}
      {!run.collapsed && (
        <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {run.steps.map(step => (
            <div key={step.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: '#666',
            }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>{STEP_ICON[step.type] ?? '·'}</span>
              <span>
                {step.type === 'thinking' && (
                  <span style={{ opacity: 0.75, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {step.text ?? 'Pensando…'}
                  </span>
                )}
                {step.type === 'tool_call' && (
                  <span style={{ color: step.isError ? '#e53e3e' : '#444' }}>
                    {step.isError && step.name && ['draw_room','place_door','place_window'].includes(step.name)
                      ? `✗ ${toolLabel(step.name, step.args as Record<string, unknown>).replace('…', '')} — fora dos limites ou sobreposição`
                      : toolLabel(step.name ?? '', step.args as Record<string, unknown>)
                    }
                  </span>
                )}
                {step.type === 'draw' && (() => {
                  const cmd = step.args as Record<string,unknown>
                  const action = cmd?.action as string
                  if (action === 'draw_room') return <span style={{ color: '#2d6a4f' }}>✓ {String(cmd.label ?? '')} desenhado</span>
                  if (action === 'place_door') return <span style={{ color: '#2d6a4f' }}>✓ Porta colocada</span>
                  if (action === 'place_window') return <span style={{ color: '#2d6a4f' }}>✓ Janela colocada</span>
                  if (action === 'delete_element') return <span style={{ color: '#888' }}>✕ {String(cmd.label ?? '')} removido</span>
                  if (action === 'clear_canvas') return <span style={{ color: '#888' }}>✕ Canvas limpo</span>
                  return <span style={{ color: '#2d6a4f' }}>✓ {action}</span>
                })()}
                {step.type === 'error' && <span style={{ color: '#e53e3e' }}>{step.text}</span>}
              </span>
            </div>
          ))}

          {run.done && run.reply && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #e8e8f0', fontSize: 12, color: '#444', lineHeight: 1.5 }}>
              <ReactMarkdown
                components={{
                  p: ({children}) => <p style={{ margin: '0 0 4px' }}>{children}</p>,
                  strong: ({children}) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                }}
              >
                {run.reply}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {/* Collapsed summary reply */}
      {run.collapsed && run.done && run.reply && (
        <div style={{ padding: '0 12px 8px', fontSize: 11, color: '#888', lineHeight: 1.4 }}>
          {run.reply.slice(0, 80)}{run.reply.length > 80 ? '…' : ''}
        </div>
      )}
    </div>
  )
}

export default function CommandBar({ onCommands, onStreamCommand, onStreamDone, siteContext, getCanvasState, getCanvasImage }: Props) {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [model, setModel] = useState('auto')
  const [modelOpen, setModelOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ⌘K focuses the input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectedModel = MODELS.find(m => m.id === model) ?? MODELS[0]
  const resolvedModel = model === 'auto' ? AUTO_MODEL_ID : model
  const resolvedModelMeta = MODELS.find(m => m.id === resolvedModel) ?? MODELS[1]

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!value.trim() || loading) return

    const prompt = value.trim()
    const runId = Date.now().toString()
    const userMsg: Message = { id: runId, role: 'user', text: prompt }

    // Placeholder agent_run message — we'll update it as events arrive
    const runMsgId = runId + '_run'
    const initialRun: AgentRun = { steps: [], done: false, reply: '', drawCount: 0, collapsed: false }
    setMessages(prev => [...prev, userMsg, { id: runMsgId, role: 'agent_run', text: '', agentRun: initialRun }])
    setValue('')
    setLoading(true)

    const updateRun = (updater: (run: AgentRun) => AgentRun) => {
      setMessages(prev => prev.map(m => m.id === runMsgId
        ? { ...m, agentRun: updater(m.agentRun!) }
        : m
      ))
    }

    try {
      const canvasImage = resolvedModelMeta.vision
        ? await getCanvasImage?.().catch(() => null) ?? null
        : null

      const res = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: resolvedModel,
          supportsTools: resolvedModelMeta.tools,
          siteContext: siteContext ?? null,
          canvasState: getCanvasState?.() ?? null,
          canvasImage,
          history: [...messages, userMsg]
            .filter(m => m.role !== 'error' && m.role !== 'agent_run')
            .map(m => ({ role: m.role === 'agent_run' ? 'assistant' : m.role, text: m.text })),
        }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error ?? 'AI request failed')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value: chunk } = await reader.read()
        if (done) break
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event: AgentEvent
          try { event = JSON.parse(line.slice(6)) } catch { continue }

          switch (event.type) {
            case 'thinking':
              updateRun(run => ({
                ...run,
                steps: [...run.steps, { id: Date.now().toString(), type: 'thinking', text: event.text }],
              }))
              break

            case 'tool_call':
              updateRun(run => ({
                ...run,
                steps: [...run.steps, {
                  id: event.callId,
                  type: 'tool_call',
                  name: event.name,
                  callId: event.callId,
                  args: event.args,
                }],
              }))
              break

            case 'tool_result':
              // Annotate the matching tool_call step with its result
              updateRun(run => ({
                ...run,
                steps: run.steps.map(s =>
                  s.callId === event.callId
                    ? { ...s, result: event.result, isError: event.isError }
                    : s
                ),
              }))
              break

            case 'draw':
              // Execute on canvas immediately
              onStreamCommand?.(event.command)
              updateRun(run => ({
                ...run,
                drawCount: run.drawCount + 1,
                steps: [...run.steps, {
                  id: Date.now().toString() + Math.random(),
                  type: 'draw',
                  label: (event.command.label as string) ?? (event.command.action as string),
                  args: event.command,
                }],
              }))
              break

            case 'error':
              updateRun(run => ({
                ...run,
                steps: [...run.steps, { id: Date.now().toString(), type: 'error', text: event.message }],
              }))
              break

            case 'done':
              onStreamDone?.()
              updateRun(run => ({
                ...run,
                done: true,
                reply: event.reply,
                drawCount: event.drawCount,
                collapsed: false,  // always stay open — user can collapse manually
              }))
              break
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '_e',
        role: 'error',
        text: err instanceof Error ? err.message : 'Erro ao processar.',
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: 340,
      background: 'rgba(255,255,255,0.97)',
      backdropFilter: 'blur(8px)',
      borderLeft: '1px solid #e8e8e8',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 400,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px 10px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 14 }}>✦</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>AI Commands</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setModelOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: '#f5f5f5', border: 'none', borderRadius: 6,
                padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#555',
              }}
            >
              {selectedModel.label}
              {selectedModel.badge && (
                <span style={{
                  fontSize: 9, background: selectedModel.badge === 'best' ? '#1a1a2e' : '#d1fae5',
                  color: selectedModel.badge === 'best' ? 'white' : '#065f46',
                  borderRadius: 4, padding: '1px 4px', fontWeight: 600,
                }}>
                  {selectedModel.badge}
                </span>
              )}
              <span style={{ fontSize: 9, color: '#999' }}>▾</span>
            </button>

            {modelOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                background: 'white', border: '1px solid #e8e8e8', borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 600, minWidth: 190,
                overflow: 'hidden',
              }}>
                {MODELS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setModelOpen(false) }}
                    style={{
                      width: '100%', textAlign: 'left', background: model === m.id ? '#f0f0f8' : 'white',
                      border: 'none', padding: '8px 12px', cursor: 'pointer',
                      fontSize: 12, color: '#333', display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8f8f8')}
                    onMouseLeave={e => (e.currentTarget.style.background = model === m.id ? '#f0f0f8' : 'white')}
                  >
                    <span>{m.label}</span>
                    {m.badge && (
                      <span style={{
                        fontSize: 9, background: m.badge === 'best' ? '#1a1a2e' : '#d1fae5',
                        color: m.badge === 'best' ? 'white' : '#065f46',
                        borderRadius: 4, padding: '1px 4px', fontWeight: 600,
                      }}>
                        {m.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <CopyLogsButton messages={messages} />
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {messages.length === 0 && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 11, color: '#aaa', marginBottom: 10 }}>Try asking:</p>
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => { setValue(ex); inputRef.current?.focus() }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: '#f8f8f8', border: 'none', borderRadius: 8,
                  padding: '7px 10px', marginBottom: 5, cursor: 'pointer',
                  fontSize: 12, color: '#555',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#efefef')}
                onMouseLeave={e => (e.currentTarget.style.background = '#f8f8f8')}
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            {msg.role === 'agent_run' ? (
              <AgentRunView run={msg.agentRun!} onToggle={() =>
                setMessages(prev => prev.map(m => m.id === msg.id
                  ? { ...m, agentRun: { ...m.agentRun!, collapsed: !m.agentRun!.collapsed } }
                  : m
                ))
              } />
            ) : (
              <div style={{
                maxWidth: '85%',
                padding: '7px 10px',
                borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: msg.role === 'user' ? '#1a1a2e'
                  : msg.role === 'error' ? '#fff0f0'
                  : '#f0f0f8',
                color: msg.role === 'user' ? 'white'
                  : msg.role === 'error' ? '#c0392b'
                  : '#333',
                fontSize: 13,
                lineHeight: 1.5,
              }}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown
                    components={{
                      p:      ({children}) => <p style={{ margin: '0 0 6px', lineHeight: 1.5 }}>{children}</p>,
                      ul:     ({children}) => <ul style={{ margin: '4px 0 6px', paddingLeft: 18 }}>{children}</ul>,
                      ol:     ({children}) => <ol style={{ margin: '4px 0 6px', paddingLeft: 18 }}>{children}</ol>,
                      li:     ({children}) => <li style={{ marginBottom: 2, lineHeight: 1.5 }}>{children}</li>,
                      strong: ({children}) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                      em:     ({children}) => <em>{children}</em>,
                      h1:     ({children}) => <div style={{ fontWeight: 700, fontSize: 14, margin: '6px 0 4px' }}>{children}</div>,
                      h2:     ({children}) => <div style={{ fontWeight: 700, fontSize: 13, margin: '6px 0 3px' }}>{children}</div>,
                      h3:     ({children}) => <div style={{ fontWeight: 600, fontSize: 12, margin: '4px 0 2px', color: '#555' }}>{children}</div>,
                      code:   ({children}) => <code style={{ fontFamily: 'monospace', fontSize: 11, background: '#e8e8f0', padding: '1px 4px', borderRadius: 3 }}>{children}</code>,
                      hr:     () => <hr style={{ border: 'none', borderTop: '1px solid #e0e0e0', margin: '8px 0' }} />,
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>
            )}
          </div>
        ))}

        {loading && !messages.some(m => m.role === 'agent_run' && !m.agentRun?.done) && (
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={{
              padding: '7px 12px', borderRadius: '12px 12px 12px 2px',
              background: '#f0f0f8', fontSize: 12, color: '#888',
            }}>
              ✦ <span style={{ opacity: 0.7 }}>processando…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        borderTop: '1px solid #f0f0f0',
        padding: '10px 12px',
        flexShrink: 0,
      }}>
        <form onSubmit={handleSubmit}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 8,
            background: '#f8f8f8', borderRadius: 12,
            border: '1px solid #e8e8e8', padding: '8px 10px',
          }}>
            <textarea
              ref={inputRef}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask AI to draw… (⌘K)"
              rows={1}
              disabled={loading}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                fontSize: 13, color: '#333', resize: 'none',
                fontFamily: 'inherit', lineHeight: 1.6,
                maxHeight: 120, overflowY: 'auto',
              }}
            />
            <button
              type="submit"
              disabled={loading || !value.trim()}
              style={{
                width: 28, height: 28, borderRadius: 8, border: 'none',
                background: value.trim() && !loading ? '#1a1a2e' : '#e0e0e0',
                color: value.trim() && !loading ? 'white' : '#aaa',
                cursor: value.trim() && !loading ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, flexShrink: 0, transition: 'background 0.15s',
              }}
            >
              ↑
            </button>
          </div>
          <p style={{ fontSize: 10, color: '#bbb', marginTop: 5, textAlign: 'center' }}>
            ↵ send · Shift+↵ newline
          </p>
        </form>
      </div>
    </div>
  )
}

// Human-readable description of what the AI executed
function describeCommand(cmd: CADCommand): string {
  switch (cmd.action) {
    case 'draw_room':
      return `Drew ${cmd.width / 100}×${cmd.height / 100}m room${cmd.label ? ` "${cmd.label}"` : ''}`
    case 'draw_wall':
      return `Drew wall (${cmd.thickness}cm thick)`
    case 'place_door':
      return `Placed ${cmd.width}cm ${cmd.swingDirection} door`
    case 'place_window':
      return `Placed ${cmd.width}cm window`
    case 'add_annotation':
      return `Added annotation: "${cmd.text}"`
    case 'add_dimension':
      return `Added dimension`
    case 'delete_selection':
      return `Deleted selection`
    case 'select_all':
      return `Selected all shapes`
    default:
      return `Command executed`
  }
}

function CopyLogsButton({ messages }: { messages: Message[] }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    if (messages.length === 0) return
    const lines = messages.map(m => {
      const role = m.role === 'user' ? '→ User' : m.role === 'error' ? '✗ Error' : '← AI'
      let body = m.text
      if (m.commands && m.commands.length > 0) {
        body += '\n' + JSON.stringify(m.commands.length === 1 ? m.commands[0] : m.commands, null, 2)
      }
      return `${role}: ${body}`
    })
    navigator.clipboard.writeText(lines.join('\n\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={copy}
      title="Copy conversation + commands as JSON"
      style={{
        background: 'none', border: '1px solid #e0e0e0', borderRadius: 6,
        padding: '3px 7px', cursor: 'pointer', fontSize: 11,
        color: copied ? '#16a34a' : '#888',
        transition: 'color 0.2s',
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? '✓ copied' : '⎘ logs'}
    </button>
  )
}
