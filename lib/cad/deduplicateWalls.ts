import { Editor, TLShapeId, createShapeId } from 'tldraw'
import { WALL_TYPE } from '@/components/canvas/shapes/WallShape'

interface WallProps {
  x1: number; y1: number
  x2: number; y2: number
  thickness: number
  layer: string
}

const SNAP = 2 // px tolerance for "same line"

type Seg = {
  id: TLShapeId
  ax: number; ay: number  // start (normalized: ax<=bx for H, ay<=by for V)
  bx: number; by: number  // end
  thickness: number
  layer: string
  isHoriz: boolean
}

function normalize(s: { id: TLShapeId; props: WallProps }): Seg {
  const { x1, y1, x2, y2, thickness, layer } = s.props
  const isHoriz = Math.abs(x2 - x1) >= Math.abs(y2 - y1)
  if (isHoriz) {
    return { id: s.id, ax: Math.min(x1, x2), ay: (y1 + y2) / 2, bx: Math.max(x1, x2), by: (y1 + y2) / 2, thickness, layer, isHoriz: true }
  } else {
    return { id: s.id, ax: (x1 + x2) / 2, ay: Math.min(y1, y2), bx: (x1 + x2) / 2, by: Math.max(y1, y2), thickness, layer, isHoriz: false }
  }
}

/**
 * Full wall cleanup after drawing rooms:
 *  1. Merge collinear overlapping segments (shared room walls → single wall)
 *  2. Trim T-junctions (vertical walls that cross into horizontal walls get clipped)
 */
export function deduplicateWalls(editor: Editor, shapeIds: TLShapeId[]) {
  const raw = shapeIds
    .map(id => editor.getShape(id))
    .filter(s => s?.type === WALL_TYPE) as { id: TLShapeId; props: WallProps }[]

  if (raw.length === 0) return

  let segs: Seg[] = raw.map(normalize)

  // ── Step 1: Merge collinear overlapping segments ──────────────────────────
  const groups = new Map<string, Seg[]>()
  for (const seg of segs) {
    const key = seg.isHoriz ? `H:${Math.round(seg.ay)}` : `V:${Math.round(seg.ax)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(seg)
  }

  const toDelete = new Set<TLShapeId>()
  const toCreate: Omit<Seg, 'id'>[] = []
  const survivors: Seg[] = []  // segs that were not merged (single in their group)

  for (const [key, group] of groups) {
    if (group.length === 1) {
      survivors.push(group[0])
      continue
    }
    const isHoriz = key.startsWith('H:')
    group.sort((a, b) => isHoriz ? a.ax - b.ax : a.ay - b.ay)

    const merged: { start: number; end: number; thickness: number; layer: string }[] = []
    for (const seg of group) {
      const start = isHoriz ? seg.ax : seg.ay
      const end   = isHoriz ? seg.bx : seg.by
      if (!merged.length) {
        merged.push({ start, end, thickness: seg.thickness, layer: seg.layer })
      } else {
        const last = merged[merged.length - 1]
        if (start <= last.end + SNAP) last.end = Math.max(last.end, end)
        else merged.push({ start, end, thickness: seg.thickness, layer: seg.layer })
      }
    }

    group.forEach(s => toDelete.add(s.id))
    const coord = parseFloat(key.slice(2))
    for (const m of merged) {
      const s: Omit<Seg, 'id'> = isHoriz
        ? { ax: m.start, ay: coord, bx: m.end, by: coord, thickness: m.thickness, layer: m.layer, isHoriz: true }
        : { ax: coord, ay: m.start, bx: coord, by: m.end, thickness: m.thickness, layer: m.layer, isHoriz: false }
      toCreate.push(s)
      // Treat merged segs as virtual survivors for trim step
      survivors.push({ ...s, id: 'merged' as TLShapeId })
    }
  }

  // ── Step 2: Trim T-junctions ──────────────────────────────────────────────
  // For every vertical seg, check if a horizontal seg crosses at its start/end
  // (i.e. vert endpoint Y == horiz Y, and horiz spans over vert X)
  // If so, clip the vert endpoint inward by half the horiz thickness.
  const allSegs = [...survivors]

  const horizSegs = allSegs.filter(s => s.isHoriz)
  const vertSegs  = allSegs.filter(s => !s.isHoriz)

  // We'll rebuild all segs after trimming
  const trimmed: Omit<Seg, 'id'>[] = []

  for (const v of vertSegs) {
    let ay = v.ay, by = v.by

    for (const h of horizSegs) {
      const hHalf = h.thickness / 2
      const vHalf = v.thickness / 2

      // Horiz must span over the vert's X
      if (h.ax - SNAP > v.ax || h.bx + SNAP < v.ax) continue

      // Trim top end (ay) if it lands inside the horizontal wall
      if (Math.abs(ay - h.ay) <= hHalf + SNAP) {
        ay = h.ay + hHalf
      }
      // Trim bottom end (by) if it lands inside the horizontal wall
      if (Math.abs(by - h.ay) <= hHalf + SNAP) {
        by = h.ay - hHalf
      }
    }

    trimmed.push({ ax: v.ax, ay, bx: v.ax, by, thickness: v.thickness, layer: v.layer, isHoriz: false })
  }

  // Horizontal segs don't need trimming (we extend them to cover corners)
  for (const h of horizSegs) {
    trimmed.push(h)
  }

  // ── Apply changes ─────────────────────────────────────────────────────────
  editor.deleteShapes([...toDelete])

  // Also delete survivors that we're replacing with trimmed versions
  const survivorOriginalIds = survivors.filter(s => s.id !== 'merged').map(s => s.id)
  editor.deleteShapes(survivorOriginalIds)

  for (const w of trimmed) {
    editor.createShape({
      id: createShapeId(),
      type: WALL_TYPE,
      x: w.ax, y: w.ay,
      props: { x1: w.ax, y1: w.ay, x2: w.bx, y2: w.by, thickness: w.thickness, layer: w.layer },
    })
  }
}
