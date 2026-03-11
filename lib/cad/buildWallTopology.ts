import { Editor, createShapeId } from 'tldraw'
import { WALL_TYPE } from '@/components/canvas/shapes/WallShape'

const SNAP = 3

interface Room { ox: number; oy: number; width: number; height: number; thickness: number }

interface Seg {
  ax: number; ay: number
  bx: number; by: number
  thickness: number
  layer: string
  isHoriz: boolean
}

export function buildWallTopology(
  editor: Editor,
  rooms: Room[],
  vpOffset: { x: number; y: number }
) {
  const rp = rooms.map(r => ({
    ox: vpOffset.x + r.ox, oy: vpOffset.y + r.oy,
    w: r.width, h: r.height, t: r.thickness,
  }))

  // ── Step 1: Raw segments ──────────────────────────────────────────────────
  const raw: Seg[] = []
  for (const r of rp) {
    raw.push({ ax: r.ox,       ay: r.oy,       bx: r.ox + r.w, by: r.oy,       thickness: r.t, layer: 'walls', isHoriz: true  })
    raw.push({ ax: r.ox,       ay: r.oy + r.h, bx: r.ox + r.w, by: r.oy + r.h, thickness: r.t, layer: 'walls', isHoriz: true  })
    raw.push({ ax: r.ox,       ay: r.oy,       bx: r.ox,       by: r.oy + r.h, thickness: r.t, layer: 'walls', isHoriz: false })
    raw.push({ ax: r.ox + r.w, ay: r.oy,       bx: r.ox + r.w, by: r.oy + r.h, thickness: r.t, layer: 'walls', isHoriz: false })
  }

  // ── Step 2: Merge collinear overlapping segments ──────────────────────────
  const groups = new Map<string, Seg[]>()
  for (const seg of raw) {
    const key = seg.isHoriz ? `H:${Math.round(seg.ay)}` : `V:${Math.round(seg.ax)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(seg)
  }

  const merged: Seg[] = []
  for (const [key, group] of groups) {
    const isHoriz = key.startsWith('H:')
    const coord = parseFloat(key.slice(2))
    group.sort((a, b) => isHoriz ? a.ax - b.ax : a.ay - b.ay)
    const spans: { start: number; end: number; t: number }[] = []
    for (const seg of group) {
      const s = isHoriz ? seg.ax : seg.ay
      const e = isHoriz ? seg.bx : seg.by
      if (!spans.length || s > spans[spans.length - 1].end + SNAP) {
        spans.push({ start: s, end: e, t: seg.thickness })
      } else {
        spans[spans.length - 1].end = Math.max(spans[spans.length - 1].end, e)
      }
    }
    for (const span of spans) {
      if (isHoriz) merged.push({ ax: span.start, ay: coord, bx: span.end, by: coord, thickness: span.t, layer: 'walls', isHoriz: true  })
      else         merged.push({ ax: coord, ay: span.start, bx: coord, by: span.end, thickness: span.t, layer: 'walls', isHoriz: false })
    }
  }

  // ── Step 3: Split at all room boundaries ─────────────────────────────────
  const allX = [...new Set(rp.flatMap(r => [r.ox, r.ox + r.w]))].sort((a, b) => a - b)
  const allY = [...new Set(rp.flatMap(r => [r.oy, r.oy + r.h]))].sort((a, b) => a - b)

  const split: Seg[] = []
  for (const seg of merged) {
    const cuts = seg.isHoriz
      ? allX.filter(x => x > seg.ax + SNAP && x < seg.bx - SNAP)
      : allY.filter(y => y > seg.ay + SNAP && y < seg.by - SNAP)
    if (!cuts.length) { split.push(seg); continue }
    const coords = [seg.isHoriz ? seg.ax : seg.ay, ...cuts, seg.isHoriz ? seg.bx : seg.by]
    for (let i = 0; i < coords.length - 1; i++) {
      if (seg.isHoriz) split.push({ ...seg, ax: coords[i], bx: coords[i + 1] })
      else             split.push({ ...seg, ay: coords[i], by: coords[i + 1] })
    }
  }

  // ── Step 4: Keep only sub-segments on a room boundary ────────────────────
  // A sub-segment belongs if its line coord matches a room edge AND its midpoint
  // falls within that room's span — BUT discard if the midpoint is strictly
  // interior to any OTHER room (it's a trespassing wall).
  function isStrictlyInsideRoom(px: number, py: number, r: { ox: number; oy: number; w: number; h: number; t: number }): boolean {
    return px > r.ox + r.t && px < r.ox + r.w - r.t &&
           py > r.oy + r.t && py < r.oy + r.h - r.t
  }

  function isOnRoomBoundary(seg: Seg): boolean {
    const mid = seg.isHoriz ? (seg.ax + seg.bx) / 2 : (seg.ay + seg.by) / 2
    for (const r of rp) {
      if (seg.isHoriz) {
        const onEdge = Math.abs(seg.ay - r.oy) < SNAP || Math.abs(seg.ay - (r.oy + r.h)) < SNAP
        if (onEdge && mid >= r.ox - SNAP && mid <= r.ox + r.w + SNAP) return true
      } else {
        const onEdge = Math.abs(seg.ax - r.ox) < SNAP || Math.abs(seg.ax - (r.ox + r.w)) < SNAP
        if (onEdge && mid >= r.oy - SNAP && mid <= r.oy + r.h + SNAP) return true
      }
    }
    return false
  }

  function isTrespassingIntoAnotherRoom(seg: Seg): boolean {
    const midX = (seg.ax + seg.bx) / 2
    const midY = (seg.ay + seg.by) / 2
    for (const r of rp) {
      if (isStrictlyInsideRoom(midX, midY, r)) return true
    }
    return false
  }

  const filtered = split.filter(seg => isOnRoomBoundary(seg) && !isTrespassingIntoAnotherRoom(seg))

  // ── Step 5: Corner trimming ───────────────────────────────────────────────
  // Rule: horizontal walls OWN corners — they extend by t/2 past intersections.
  // Vertical walls INSET by t/2 at each end where a horizontal wall meets them.
  // This prevents thick-stroke overlap blobs at every corner and T-junction.
  const horizSegs = filtered.filter(s => s.isHoriz)
  const vertSegs  = filtered.filter(s => !s.isHoriz)

  // Extend horizontal walls by t/2 at each end (to cap corners cleanly)
  const extendedHoriz: Seg[] = horizSegs.map(h => ({
    ...h, ax: h.ax - h.thickness / 2, bx: h.bx + h.thickness / 2
  }))

  // Trim vertical walls: for each end, if a horizontal wall exists at that Y
  // that covers this vertical wall's X, inset by hThickness/2
  const trimmedVerts: Seg[] = vertSegs.map(v => {
    let ay = v.ay, by = v.by
    for (const h of horizSegs) {
      if (h.ax - SNAP > v.ax || h.bx + SNAP < v.ax) continue  // h doesn't cover v.ax
      const hHalf = h.thickness / 2
      if (Math.abs(ay - h.ay) < hHalf + SNAP) ay = h.ay + hHalf
      if (Math.abs(by - h.ay) < hHalf + SNAP) by = h.ay - hHalf
    }
    return { ...v, ay, by }
  }).filter(v => v.by - v.ay > SNAP)

  // ── Step 6: Create shapes ─────────────────────────────────────────────────
  for (const w of [...extendedHoriz, ...trimmedVerts]) {
    editor.createShape({
      id: createShapeId(),
      type: WALL_TYPE,
      x: w.ax, y: w.ay,
      props: { x1: w.ax, y1: w.ay, x2: w.bx, y2: w.by, thickness: w.thickness, layer: w.layer },
    })
  }
}
