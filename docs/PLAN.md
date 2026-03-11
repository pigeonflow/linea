# Linea — AI-First CAD for Architects

> "Draw what you mean."

Linea is a web-based 2D architectural CAD tool with AI baked in from day one.
The target user is the junior architect or small firm that drafts floor plans,
hates AutoCAD's price tag ($2,300/yr), and wants a tool that *understands* what
they're trying to build.

---

## Vision

The "Cursor for CAD" — an infinite canvas where you can draw the traditional way
OR just describe what you want and watch it happen. AI isn't a bolt-on panel; it's
woven into every interaction: command line, context suggestions, compliance hints,
auto-annotation.

---

## Target Users

- Junior architects & architecture students
- Small firms (1–5 people) who do residential/commercial floor plans
- Freelance designers who work with contractors
- **Not** targeting: structural/mechanical engineers, BIM workflows (for now)

---

## Core Differentiators

1. **Natural language command line** — type "add a 90cm door on the north wall" and it executes
2. **AI sidebar** — watches your drawing, suggests next steps, flags issues
3. **Inline compliance hints** — "this corridor is 80cm, accessibility minimum is 90cm"
4. **Web-first** — no install, instant share, real-time collab
5. **Affordable** — freemium, fraction of AutoCAD cost

---

## Tech Stack

### Frontend
- **Framework:** Next.js 14 (App Router) + TypeScript
- **Canvas Engine:** `tldraw` — infinite canvas SDK, extensible shapes/tools, AI primitives built-in
- **Styling:** Tailwind CSS + shadcn/ui
- **State:** Zustand (canvas state) + tldraw's built-in store

### Geometry / CAD Engine
- **`@flatten-js/core`** — 2D geometry (intersections, distances, area calculations)
- **`polygon-clipping`** — boolean ops (wall merging, room area subtraction, openings)
- **`mathjs`** — unit parsing ("3.5m", "12ft") and conversions

### DXF Import/Export
- **`dxf` (skymakerolof/dxf)** — DXF parser → SVG/polylines for import
- **`makerjs`** — programmatic DXF/SVG generation for export (Microsoft-backed, clean API)

### AI Layer
- **`ai` (Vercel AI SDK)** — streaming, structured outputs, React hooks, tool calling
- **`@ai-sdk/openai`** pointed at **OpenRouter** — model flexibility + cost optimization
- **`zod`** — schema validation for all AI-generated CAD commands
- **Models:** Claude Sonnet (primary), gpt-4o (fallback), cheaper models for suggestions

### Backend / Infra
- **Supabase** — auth, project storage, real-time collab
- **Next.js API routes** — AI endpoints (server-side, keeps API keys safe)
- **Vercel** — deployment

---

## Data Model

### CAD Command Schema (AI Output)
```typescript
// All AI actions are validated against these Zod schemas
const WallCommand = z.object({
  action: z.literal('draw_wall'),
  from: z.tuple([z.number(), z.number()]),
  to: z.tuple([z.number(), z.number()]),
  thickness: z.number().default(20), // cm
  layer: z.string().default('walls'),
})

const DoorCommand = z.object({
  action: z.literal('place_door'),
  wallId: z.string(),
  position: z.number(), // 0–1 along wall
  width: z.number().default(90), // cm
  swingDirection: z.enum(['left', 'right', 'double']),
})

const RoomCommand = z.object({
  action: z.literal('draw_room'),
  origin: z.tuple([z.number(), z.number()]),
  width: z.number(),
  height: z.number(),
  label: z.string().optional(),
})

const CADCommand = z.discriminatedUnion('action', [
  WallCommand, DoorCommand, RoomCommand,
  // ... window, stair, dimension, annotation, etc.
])
```

### Project Storage (Supabase)
```sql
projects (id, user_id, name, created_at, updated_at)
drawings (id, project_id, name, canvas_json, thumbnail_url, updated_at)
-- canvas_json = tldraw store snapshot
```

---

## Architectural Shape Library (tldraw custom shapes)

Each shape knows its own geometry and renders itself:

| Shape | Properties |
|---|---|
| `WallShape` | from, to, thickness, layer |
| `DoorShape` | width, swing direction, arc preview |
| `WindowShape` | width, sill depth |
| `RoomShape` | polygon, label, area (auto-calculated) |
| `StairShape` | width, rise count, direction |
| `DimensionShape` | from, to, offset, label |
| `AnnotationShape` | position, text, leader line |

---

## AI Features (MVP → Post-MVP)

### MVP
- **Natural language command bar** (`/` or `Cmd+K`)
  - "draw a 4x3m kitchen" → executes RoomCommand
  - "add a door on the south wall" → executes DoorCommand
  - "rotate selection 90 degrees" → executes TransformCommand
- **AI auto-labeling** — select a room, AI suggests label based on dimensions
- **Basic compliance hints** — door width, corridor width warnings

### Post-MVP
- **AI sidebar** — watches canvas, proactively suggests ("you have no bathroom")
- **Style from photo** — upload reference image, AI extracts layout
- **Description → floor plan** — "generate a 2-bedroom apartment, ~80sqm"
- **Smart snap** — AI predicts where you're drawing based on context
- **Export to PDF with auto-annotations**

---

## MVP Scope (Phase 1)

**Goal:** A working floor plan tool where you can draw walls, place doors/windows,
label rooms, and use a natural language command bar.

### P1 Features
- [ ] Infinite canvas (tldraw base)
- [ ] Wall tool (draw by click-drag, snaps to grid/angles)
- [ ] Door tool (place on wall, swing arc preview)
- [ ] Window tool
- [ ] Room auto-detection (when walls enclose a space, detect + calculate area)
- [ ] Layer panel (walls, doors/windows, furniture, annotations)
- [ ] Grid + snap (configurable: cm/m/ft)
- [ ] `Cmd+K` AI command bar
- [ ] DXF export (via makerjs)
- [ ] Auth + project save (Supabase)
- [ ] Share link (read-only)

### Out of Scope for MVP
- Real-time collab (tldraw sync)
- DXF import
- 3D view
- Mobile

---

## Phases

### Phase 1 — Foundation (MVP)
Core canvas, custom shapes, wall/door/window tools, grid snap, basic AI command bar, auth, save/export.

### Phase 2 — Intelligence
AI sidebar, compliance hints, auto-annotation, room labeling, smart suggestions.

### Phase 3 — Collaboration + Polish
Real-time collab (tldraw sync), comments, version history, project dashboard.

### Phase 4 — Power Features
DXF import, PDF export with title block, furniture library, area schedules.

### Phase 5 — Growth
Template library, public sharing, team workspaces, API.

---

## Monetization

- **Free:** 3 projects, DXF export watermarked
- **Pro ($19/mo):** Unlimited projects, clean export, AI command bar (100 uses/mo included)
- **Studio ($49/mo):** Team features, real-time collab, unlimited AI

---

## Key Risks

1. **tldraw custom shapes complexity** — need to deeply learn tldraw's shape API; mitigate with prototyping early
2. **DXF export fidelity** — architects expect pixel-perfect DXF; makerjs may need customization
3. **AI geometry accuracy** — LLMs can hallucinate coordinates; Zod schemas + strict validation are critical
4. **AutoCAD habit lock-in** — users know AutoCAD keybindings; consider AutoCAD-compatible shortcuts

---

## Competitive Landscape

| Tool | Price | AI | Web | Open |
|---|---|---|---|---|
| AutoCAD | $2,300/yr | Basic assistant | No | No |
| SketchUp | $299/yr | None | Partial | No |
| Floorplanner | $29/mo | None | Yes | No |
| Planner 5D | Free/paid | Limited | Yes | No |
| **Linea** | **$19/mo** | **Core feature** | **Yes** | **—** |

---

## Next Steps

1. Scaffold Next.js project with tldraw
2. Build first custom shape: `WallShape`
3. Wire up `Cmd+K` command bar with a basic AI endpoint
4. Prove the loop: type → AI → canvas executes
5. Build out remaining MVP shapes
6. Auth + Supabase project save
7. DXF export

---

*Created: 2026-03-10 | Status: Planning*
