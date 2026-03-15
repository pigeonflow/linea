# Linea

AI-powered floor plan editor for Brazilian construction. You describe a space in natural language — Linea draws it.

```
> draw a 3-bedroom beach house with open kitchen
```

The agent interprets the prompt, places rooms with correct adjacency, validates against Brazilian construction norms (NBR 15575, NBR 9050, municipal codes), and renders the result on a live canvas.

---

## What it does

- **Natural language → floor plan.** Type what you want. The AI figures out room placement, dimensions, circulation paths, and sun orientation.
- **Brazilian norms built in.** Room minimums, accessibility clearances, and regional codes are baked into the AI's context — not afterthoughts.
- **Agentic loop with live feedback.** The agent streams its work step by step. You watch rooms appear on the canvas as each tool call resolves, not all at once at the end.
- **Constraint-aware layout.** Rooms can't overlap. Adjacency is computed geometrically. The agent sees the current canvas state between rounds and corrects itself.

---

## Stack

- [Next.js](https://nextjs.org) (App Router)
- [tldraw](https://tldraw.dev) — canvas rendering
- [OpenRouter](https://openrouter.ai) — model routing (works with any model)
- [Vercel AI SDK](https://sdk.vercel.ai) — streaming

---

## Getting started

```bash
git clone https://github.com/pigeonflow/linea
cd linea
npm install
```

Create a `.env.local`:

```env
OPENROUTER_API_KEY=your_key_here
NEXT_PUBLIC_SUPABASE_URL=        # optional, for persistence
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # optional
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How the agent works

Each prompt triggers an agentic loop:

1. The model receives the current canvas state + your prompt
2. It calls tools (`draw_room`, `compute_position`, `validate_layout`, etc.)
3. Each tool result is fed back into the next loop round
4. The loop continues until the model stops calling tools or hits the cap

The server streams SSE events as the loop runs — `thinking`, `tool_call`, `draw`, `done`. The canvas updates live with each `draw` event.

---

## Project structure

```
app/
  api/ai/command/       # SSE streaming agent loop
  api/ai/skills/        # Brazilian construction norms context
components/
  canvas/
    LineaCanvas.tsx     # tldraw canvas + shape rendering
    CommandBar.tsx      # prompt input + live agent log
lib/
  cad/
    commands.ts         # draw command schemas (Zod)
    computePosition.ts  # geometric room placement
    validateLayout.ts   # overlap + bounds checks
    serializeCanvas.ts  # canvas → model-readable state
```

---

## Status

Early. The core loop works. Streaming is planned (see `docs/STREAMING_AGENT_PLAN.md`). Not production ready.

---

## License

MIT
