'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { CADCommand } from '@/lib/cad/commands'
import { SiteContext } from './VizinhoPanel'

interface Props {
  onCommands: (commands: CADCommand[]) => void
  siteContext?: SiteContext | null
}

const MODELS = [
  { id: 'auto',                                    label: 'Auto',            badge: 'free' },
  { id: 'google/gemini-3.1-flash-lite-preview',    label: 'Gemini Flash',    badge: 'free' },
  { id: 'anthropic/claude-3.5-sonnet',             label: 'Claude Sonnet',   badge: '' },
  { id: 'anthropic/claude-3.7-sonnet',             label: 'Claude 3.7',      badge: 'best' },
  { id: 'openai/gpt-4o',                           label: 'GPT-4o',          badge: '' },
  { id: 'openai/gpt-4o-mini',                      label: 'GPT-4o Mini',     badge: '' },
  { id: 'google/gemini-2.0-flash-001',             label: 'Gemini 2.0 Flash',badge: '' },
]

// auto resolves to the free model
const AUTO_MODEL = 'google/gemini-3.1-flash-lite-preview'

type MessageRole = 'user' | 'assistant' | 'error'
interface Message {
  id: string
  role: MessageRole
  text: string
  command?: CADCommand
  commands?: CADCommand[]  // full list for history context
}

const EXAMPLES = [
  'Draw a 4×3m bedroom',
  'Add a 90cm door on the north wall',
  'Add a 120cm window',
  'Draw a wall from 0,0 to 400,0',
  'Label this room "Living Room"',
]

export default function CommandBar({ onCommands, siteContext }: Props) {
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
  const resolvedModel = model === 'auto' ? AUTO_MODEL : model

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!value.trim() || loading) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: value.trim() }
    setMessages(prev => [...prev, userMsg])
    const prompt = value.trim()
    setValue('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: resolvedModel,
          siteContext: siteContext ?? null,
          // Send prior messages (exclude errors) so AI knows what's on canvas
          history: [...messages, userMsg]
            .filter(m => m.role !== 'error')
            .map(m => ({
              role: m.role,
              text: m.text,
              commands: m.commands,
            })),
        }),
      })

      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'AI request failed')

      if (data.reply) {
        // Conversational response — no canvas action
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '_a',
          role: 'assistant',
          text: data.reply,
        }])
      } else {
        const commands: CADCommand[] = data.commands
        onCommands(commands)
        const desc = commands.length === 1
          ? describeCommand(commands[0])
          : `Executei ${commands.length} operações`
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '_a',
          role: 'assistant',
          text: desc,
          command: commands[0],
          commands,
        }])
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '_e',
        role: 'error',
        text: err instanceof Error ? err.message : 'Could not process that command.',
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
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={{
              padding: '7px 12px', borderRadius: '12px 12px 12px 2px',
              background: '#f0f0f8', fontSize: 12, color: '#888',
            }}>
              <span style={{ animation: 'pulse 1.5s infinite' }}>thinking…</span>
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
      const body = m.command
        ? `${m.text}\n${JSON.stringify(m.command, null, 2)}`
        : m.text
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
