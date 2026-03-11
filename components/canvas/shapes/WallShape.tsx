import {
  ShapeUtil,
  SVGContainer,
  Polygon2d,
  Vec,
  TLShape,
  toDomPrecision,
  T,
} from 'tldraw'

// ─── Type Registration ──────────────────────────────────────────────────────

export const WALL_TYPE = 'wall' as const

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    wall: {
      x1: number
      y1: number
      x2: number
      y2: number
      thickness: number
      layer: string
    }
  }
}

export type WallShape = TLShape<typeof WALL_TYPE>

// ─── Geometry Helper ────────────────────────────────────────────────────────

function getWallCorners(props: WallShape['props'], shapeX: number, shapeY: number) {
  const { x1, y1, x2, y2, thickness } = props

  // Absolute coords → relative to shape origin
  const ax1 = x1 - shapeX, ay1 = y1 - shapeY
  const ax2 = x2 - shapeX, ay2 = y2 - shapeY

  const dx = ax2 - ax1
  const dy = ay2 - ay1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return null

  const nx = (-dy / len) * (thickness / 2)
  const ny = (dx / len) * (thickness / 2)

  return [
    new Vec(ax1 + nx, ay1 + ny),
    new Vec(ax2 + nx, ay2 + ny),
    new Vec(ax2 - nx, ay2 - ny),
    new Vec(ax1 - nx, ay1 - ny),
  ]
}

function cornersToPath(corners: Vec[]) {
  return (
    corners.map((p, i) => `${i === 0 ? 'M' : 'L'}${toDomPrecision(p.x)},${toDomPrecision(p.y)}`).join(' ') + ' Z'
  )
}

// ─── ShapeUtil ──────────────────────────────────────────────────────────────

export class WallShapeUtil extends ShapeUtil<WallShape> {
  static override type = WALL_TYPE

  static override props = {
    x1: T.number,
    y1: T.number,
    x2: T.number,
    y2: T.number,
    thickness: T.number,
    layer: T.string,
  }

  getDefaultProps(): WallShape['props'] {
    return {
      x1: 0,
      y1: 0,
      x2: 200,
      y2: 0,
      thickness: 20,
      layer: 'walls',
    }
  }

  getGeometry(shape: WallShape) {
    const corners = getWallCorners(shape.props, shape.x, shape.y)
    if (!corners) {
      return new Polygon2d({ points: [new Vec(0, 0), new Vec(1, 0), new Vec(1, 1)], isFilled: true })
    }
    return new Polygon2d({ points: corners, isFilled: true })
  }

  component(shape: WallShape) {
    const corners = getWallCorners(shape.props, shape.x, shape.y)
    if (!corners) return null

    return (
      <SVGContainer>
        <path
          d={cornersToPath(corners)}
          fill="#2c2c2c"
          stroke="#111111"
          strokeWidth={1}
          strokeLinejoin="round"
        />
      </SVGContainer>
    )
  }

  indicator(shape: WallShape) {
    const corners = getWallCorners(shape.props, shape.x, shape.y)
    if (!corners) return null
    return <path d={cornersToPath(corners)} />
  }
}
