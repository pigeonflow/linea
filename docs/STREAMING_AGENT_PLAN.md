# Linea Streaming Agent Loop — Design Doc

## Problem
Current architecture: user sends prompt → API accumulates all tool calls → returns one big batch → canvas draws everything at once.

This is not agentic. No feedback. No loop visibility. Rooms appear out of nowhere.

Cursor works differently: the agent streams its reasoning AND its actions in real time. The user watches it think and build step by step. Each tool call is visible. The canvas updates live as each room is drawn.

---

## Architecture

### Event Types (SSE stream)

```ts
type AgentEvent =
  | { type: 'thinking';     text: string }                    // model's prose before tool call
  | { type: 'tool_call';    name: string; args: unknown }     // about to call a tool
  | { type: 'tool_result';  name: string; result: unknown }   // tool returned
  | { type: 'draw';         command: DrawCommand }            // execute this on canvas NOW
  | { type: 'error';        message: string }                 // tool or model error
  | { type: 'done';         reply: string; count: number }    // final summary
```

Key insight: `draw` events are separate from `tool_call`/`tool_result`. When the model calls `draw_room`, the server:
1. Validates the room (bounds, overlaps)
2. Emits `tool_call` event (UI shows it)
3. Emits `draw` event immediately (canvas draws it NOW)
4. Emits `tool_result` event (model sees the result AND so does the UI)

This means the agent sees canvas state updating in real time too — if we pass the accumulating `drawCommands[]` into the next loop iteration, the model's tool results reflect the growing canvas.

### Server: `app/api/ai/command/route.ts`

Switch from `NextResponse.json()` to `new Response(stream)` with `Content-Type: text/event-stream`.

```ts
const stream = new ReadableStream({
  async start(controller) {
    const emit = (event: AgentEvent) => {
      controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
    }

    // agentic loop
    while (loopCount < MAX_LOOPS) {
      const res = await fetch(openrouter, { body: ..., stream: true? })
      // parse tool calls from response
      
      if (model.content) emit({ type: 'thinking', text: model.content })
      
      for (const tc of tool_calls) {
        emit({ type: 'tool_call', name: tc.name, args: tc.args })
        
        const result = executeTool(tc.name, tc.args, drawCommands)
        
        // If it produced a draw command, emit it immediately
        const newDraw = drawCommands[drawCommands.length - 1]
        if (tc.name in DRAW_TOOLS && newDraw) {
          emit({ type: 'draw', command: newDraw })
        }
        
        emit({ type: 'tool_result', name: tc.name, result })
      }
      
      if (no_more_tool_calls) {
        emit({ type: 'done', reply: finalText, count: drawCommands.length })
        break
      }
    }
    
    controller.close()
  }
})

return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  }
})
```

Note: OpenRouter doesn't stream tool calls easily. We keep the per-loop fetch non-streaming (one request per loop round) but emit events between rounds. This is good enough — each round still shows up in real time.

### Client: `CommandBar.tsx`

Replace `fetch(...).then(res => res.json())` with an `EventSource`-style `fetch` + `ReadableStream` reader.

```ts
const response = await fetch('/api/ai/command', { method: 'POST', body: ... })
const reader = response.body!.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  
  const lines = decoder.decode(value).split('\n')
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    const event: AgentEvent = JSON.parse(line.slice(6))
    handleEvent(event)
  }
}
```

`handleEvent` updates UI state and dispatches to canvas:

```ts
function handleEvent(event: AgentEvent) {
  switch (event.type) {
    case 'thinking':
      // Show thinking bubble in CommandBar (collapsible)
      appendAgentLog({ type: 'thinking', text: event.text })
      break
    case 'tool_call':
      // Show step: "→ compute_position(sala, adjacent_east)"
      appendAgentLog({ type: 'tool_call', name: event.name, args: event.args })
      break
    case 'tool_result':
      // Annotate the last tool_call step with its result
      resolveLastToolCall(event.name, event.result)
      break
    case 'draw':
      // Execute on canvas IMMEDIATELY
      onCommand(event.command)   // ← LineaCanvas.executeOne()
      appendAgentLog({ type: 'draw', label: event.command.label })
      break
    case 'error':
      appendAgentLog({ type: 'error', text: event.message })
      break
    case 'done':
      setAssistantMessage(event.reply)
      setIsLoading(false)
      break
  }
}
```

### Client: Agent Log UI

The CommandBar message list gains a new message type: `agent_run`. While the agent is running, this message is live — it renders the accumulating tool call steps.

```
┌─────────────────────────────────────────┐
│ 💭 "Vou criar uma casa de praia..."     │  ← thinking (collapsible)
├─────────────────────────────────────────┤
│ ⚙ compute_position                      │
│   sala → adjacent_east                  │
│   ✓ origin: [750, 500]                  │
├─────────────────────────────────────────┤
│ 🟦 draw_room                            │
│   suíte master  400×350cm               │  ← appears as canvas draws it
├─────────────────────────────────────────┤
│ ⚙ compute_position                      │
│   suíte master → adjacent_east          │  ← running... (spinner)
└─────────────────────────────────────────┘
```

After completion, the run collapses into a summary:
```
┌─────────────────────────────────────────┐
│ ✓ Casa de praia criada                  │
│   9 cômodos · 187m² · 3 erros corrigidos│
│   ▶ ver detalhes                        │
└─────────────────────────────────────────┘
```

### LineaCanvas: `onCommand` (singular) prop

Add `onCommand: (cmd: DrawCommand) => void` alongside existing `onCommands`.
`executeOne` already exists — just expose it via a ref or callback.

```ts
// LineaCanvas.tsx
useImperativeHandle(ref, () => ({
  executeOne,
  executeCommands,
}))
// OR simpler: just pass onCommand prop down
```

CommandBar calls `onCommand(event.command)` for each `draw` event.

---

## Key Design Decisions

### 1. Non-streaming OpenRouter calls (per loop round)
OpenRouter streaming for tool calls is complex and unreliable. We do one `fetch` per loop round (same as now) but emit SSE events between rounds. The user sees each round complete in ~1-2s, one at a time. Still feels live.

### 2. Agent sees real canvas state between rounds
After each round, `drawCommands[]` contains all rooms drawn so far. The system prompt `canvasStateMsg` can be updated between rounds to reflect the growing canvas — the agent gets feedback on what it has drawn.

### 3. Thinking text
Gemini often outputs prose before tool calls (`msg.content` + `msg.tool_calls`). We emit this as `thinking`. GPT-4o usually skips it. Either way, it's optional and UI handles both.

### 4. Error visibility
When the bounds check or overlap check rejects a room, we currently silently push a tool_result error back to the model. Now we also emit an `error` event so the user sees: `⚠ "cozinha" fora da área construível — redirecionando para compute_position`.

### 5. Abort
Add `AbortController` to the fetch. If user sends a new message while agent is running, abort the stream and start fresh.

---

## Implementation Order

1. **`route.ts`** → convert to SSE stream, emit events per tool call
2. **`CommandBar.tsx`** → consume SSE stream, update agent log UI live
3. **`LineaCanvas.tsx`** → expose `executeOne` via prop/ref, called per `draw` event
4. **Agent log UI** → new live step component in CommandBar
5. **Polish** → collapse/expand, summary, abort button

---

## Files Changed

- `app/api/ai/command/route.ts` — SSE stream instead of JSON response
- `components/canvas/CommandBar.tsx` — stream reader + live agent log
- `components/canvas/LineaCanvas.tsx` — `onCommand` singular prop
- (new) `components/canvas/AgentLog.tsx` — live step list component

---

## What Does NOT Change

- `computePosition`, `validateLayout`, `buildWallTopology` — untouched
- Tool definitions (TOOLS array) — untouched
- Zod command schemas — untouched
- tldraw shape drawing logic — untouched

The streaming is purely a transport + UI change on top of the existing agentic loop.
