import { Editor } from 'tldraw'
import { WALL_TYPE } from '@/components/canvas/shapes/WallShape'
import { DOOR_TYPE } from '@/components/canvas/shapes/DoorShape'
import { WINDOW_TYPE } from '@/components/canvas/shapes/WindowShape'

export interface CanvasRoom {
  id: string
  label: string
  /** Position in terrain coords (cm), (0,0) = lot top-left */
  origin: [number, number]
  width: number   // cm
  height: number  // cm
  areaSqM: number // m²
  wallThickness: number
  walls: { north: string; south: string; east: string; west: string }
}

export interface CanvasDoor {
  id: string
  /** Center position in terrain coords (cm) */
  position: [number, number]
  width: number
  rotation: number
  swingDirection: string
}

export interface CanvasWindow {
  id: string
  /** Center position in terrain coords (cm) */
  position: [number, number]
  width: number
  rotation: number
}

export interface CanvasAnnotation {
  id: string
  position: [number, number]
  text: string
}

export interface SunState {
  city: string
  azimuthDeg: number   // degrees from north
  altitudeDeg: number
  time: string         // HH:MM
  date: string         // ISO date
  northAngleDeg: number
}

export interface SiteState {
  city: string
  lotWidthM: number
  lotHeightM: number
  setbacks: { frontalM: number; lateralM: number; fundosM: number }
  buildableAreaSqM: number
}

export interface CanvasState {
  rooms: CanvasRoom[]
  doors: CanvasDoor[]
  windows: CanvasWindow[]
  annotations: CanvasAnnotation[]
  summary: {
    roomCount: number
    totalBuiltAreaSqM: number
    roomsWithoutDoor: string[]
    roomsWithoutWindow: string[]
  }
  sun?: SunState
  site?: SiteState
}

function pointNearWall(pos: [number, number], room: CanvasRoom, tol = 60): boolean {
  const [px, py] = pos
  const [rx, ry] = room.origin
  const rx2 = rx + room.width, ry2 = ry + room.height
  return (
    (Math.abs(py - ry)  < tol && px >= rx - tol && px <= rx2 + tol) ||
    (Math.abs(py - ry2) < tol && px >= rx - tol && px <= rx2 + tol) ||
    (Math.abs(px - rx)  < tol && py >= ry - tol && py <= ry2 + tol) ||
    (Math.abs(px - rx2) < tol && py >= ry - tol && py <= ry2 + tol)
  )
}

function isHabitable(label: string): boolean {
  const l = label.toLowerCase()
  return l.includes('quarto') || l.includes('sala') || l.includes('cozinha') ||
    l.includes('dormitório') || l.includes('suíte') || l.includes('escritório') ||
    l.includes('varanda') || l.includes('living')
}

export interface SerializeOptions {
  vpOffset: { x: number; y: number }
  sun?: SunState
  site?: SiteState
}

/** Serialize the current tldraw canvas into a rich state object for the AI */
export function serializeCanvas(editor: Editor, opts: SerializeOptions): CanvasState {
  const { vpOffset, sun, site } = opts
  const shapes = editor.getCurrentPageShapes()
  const state: CanvasState = {
    rooms: [], doors: [], windows: [], annotations: [],
    summary: { roomCount: 0, totalBuiltAreaSqM: 0, roomsWithoutDoor: [], roomsWithoutWindow: [] },
    sun,
    site,
  }

  // ── Collect rooms from geo shapes (rectangles drawn by draw_room)
  // draw_room creates a geo shape for the filled room rect
  for (const shape of shapes) {
    if (shape.type === WALL_TYPE) continue

    if (shape.type === 'geo') {
      const p = shape.props as unknown as Record<string, unknown>
      if (p.geo !== 'rectangle') continue
      const w = (p.w as number) ?? 0
      const h = (p.h as number) ?? 0
      if (w < 50 || h < 50) continue  // skip tiny shapes
      const origin: [number, number] = [
        Math.round(shape.x - vpOffset.x),
        Math.round(shape.y - vpOffset.y),
      ]
      const areaSqM = Math.round((w / 100) * (h / 100) * 10) / 10
      // Try to get label from shape metadata or nearby text
      const label = (p.label as string) ?? ''
      state.rooms.push({
        id: shape.id,
        label,
        origin,
        width: Math.round(w),
        height: Math.round(h),
        areaSqM,
        wallThickness: (p.wallThickness as number) ?? 20,
        walls: {
          north: `parede norte em y=${origin[1]}`,
          south: `parede sul em y=${origin[1] + Math.round(h)}`,
          west:  `parede oeste em x=${origin[0]}`,
          east:  `parede leste em x=${origin[0] + Math.round(w)}`,
        },
      })
    }

    if (shape.type === DOOR_TYPE) {
      const p = shape.props as unknown as Record<string, unknown>
      state.doors.push({
        id: shape.id,
        position: [Math.round(shape.x - vpOffset.x), Math.round(shape.y - vpOffset.y)],
        width: (p.width as number) ?? 90,
        rotation: (p.rotation as number) ?? 0,
        swingDirection: (p.swing as string) ?? 'left',
      })
    }

    if (shape.type === WINDOW_TYPE) {
      const p = shape.props as unknown as Record<string, unknown>
      state.windows.push({
        id: shape.id,
        position: [Math.round(shape.x - vpOffset.x), Math.round(shape.y - vpOffset.y)],
        width: (p.width as number) ?? 120,
        rotation: (p.rotation as number) ?? 0,
      })
    }

    if (shape.type === 'text') {
      const p = shape.props as unknown as Record<string, unknown>
      const rich = p.richText as { content?: { content?: { content?: { text?: string }[] }[] }[] }
      const text = rich?.content?.[0]?.content?.[0]?.content?.[0]?.text ?? ''
      if (text) {
        state.annotations.push({
          id: shape.id,
          position: [Math.round(shape.x - vpOffset.x), Math.round(shape.y - vpOffset.y)],
          text,
        })
      }
    }
  }

  // ── Summary
  const totalArea = state.rooms.reduce((s, r) => s + r.areaSqM, 0)
  state.summary = {
    roomCount: state.rooms.length,
    totalBuiltAreaSqM: Math.round(totalArea * 10) / 10,
    roomsWithoutDoor: state.rooms
      .filter(r => !state.doors.some(d => pointNearWall(d.position, r)))
      .map(r => r.label || r.id),
    roomsWithoutWindow: state.rooms
      .filter(r => isHabitable(r.label) && !state.windows.some(w => pointNearWall(w.position, r)))
      .map(r => r.label || r.id),
  }

  return state
}

/**
 * Capture a PNG screenshot of the current canvas as a base64 string.
 * Uses tldraw's built-in toImageDataUrl pipeline.
 */
export async function captureCanvasImage(editor: Editor): Promise<string | null> {
  try {
    const shapeIds = [...editor.getCurrentPageShapeIds()]
    if (shapeIds.length === 0) return null

    const result = await editor.toImageDataUrl(shapeIds, {
      format: 'png',
      scale: 0.4,      // low-res — good enough for AI vision, keeps payload small
      background: true,
    })
    if (!result?.url) return null
    return result.url.split(',')[1] ?? null
  } catch {
    return null
  }
}
