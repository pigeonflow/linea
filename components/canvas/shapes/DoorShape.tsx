import {
  ShapeUtil,
  SVGContainer,
  Rectangle2d,
  TLShape,
  T,
  toDomPrecision,
} from 'tldraw'

// ─── Type Registration ──────────────────────────────────────────────────────

export const DOOR_TYPE = 'door' as const

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    door: {
      width: number           // cm
      swing: 'left' | 'right' | 'double' | 'sliding'
      rotation: number        // degrees, stored for info only (use shape.rotation)
    }
  }
}

export type DoorShape = TLShape<typeof DOOR_TYPE>

// ─── ShapeUtil ──────────────────────────────────────────────────────────────

export class DoorShapeUtil extends ShapeUtil<DoorShape> {
  static override type = DOOR_TYPE

  static override props = {
    width: T.number,
    swing: T.literalEnum('left', 'right', 'double', 'sliding'),
    rotation: T.number,
  }

  getDefaultProps(): DoorShape['props'] {
    return { width: 90, swing: 'left', rotation: 0 }
  }

  // Bounding box: door opening width × wall thickness (20cm) + swing arc radius
  getGeometry(shape: DoorShape) {
    const w = shape.props.width
    const arcR = w // swing arc radius = door width
    return new Rectangle2d({ width: w + 4, height: arcR + 10, isFilled: false })
  }

  component(shape: DoorShape) {
    const { width, swing } = shape.props
    const w = width
    const arcR = w

    // Door opening gap (thin line at top = wall opening)
    // Swing arc drawn as a quarter-circle
    // Left swing: arc from top-left corner going right+down
    // Right swing: arc from top-right corner going left+down

    let path = ''
    let arcPath = ''

    if (swing === 'sliding') {
      // Sliding door: two overlapping rectangles
      path = `
        M 0 0 L ${w} 0
        M 0 6 L ${w * 0.6} 6
        M ${w * 0.4} 12 L ${w} 12
      `
    } else if (swing === 'double') {
      // Double door: two arcs from center outward
      const half = w / 2
      arcPath = `
        M ${half} 0 A ${half} ${half} 0 0 0 0 ${half}
        M ${half} 0 A ${half} ${half} 0 0 1 ${w} ${half}
      `
      path = `M 0 0 L ${w} 0`
    } else if (swing === 'right') {
      // Hinge on right, door swings left-down
      arcPath = `M ${w} 0 A ${w} ${w} 0 0 0 0 ${w}`
      path = `
        M 0 0 L ${w} 0
        M 0 0 L 0 ${w}
      `
    } else {
      // Left swing (default): hinge on left, door swings right-down
      arcPath = `M 0 0 A ${w} ${w} 0 0 1 ${w} ${w}`
      path = `
        M 0 0 L ${w} 0
        M ${w} 0 L ${w} ${w}
      `
    }

    return (
      <SVGContainer>
        {/* Wall opening — thick line */}
        <line
          x1={0} y1={0}
          x2={toDomPrecision(w)} y2={0}
          stroke="#2c2c2c"
          strokeWidth={3}
        />
        {/* Door leaf */}
        {swing !== 'sliding' && swing !== 'double' && (
          <line
            x1={swing === 'left' ? 0 : w} y1={0}
            x2={swing === 'left' ? w : 0} y2={w}
            stroke="#555"
            strokeWidth={1.5}
            strokeDasharray="none"
          />
        )}
        {/* Swing arc */}
        {arcPath && (
          <path
            d={arcPath}
            fill="none"
            stroke="#888"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}
      </SVGContainer>
    )
  }

  indicator(shape: DoorShape) {
    return (
      <rect
        width={shape.props.width + 4}
        height={shape.props.width + 10}
      />
    )
  }
}
