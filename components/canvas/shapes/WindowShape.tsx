import {
  ShapeUtil,
  SVGContainer,
  Rectangle2d,
  TLShape,
  T,
  toDomPrecision,
} from 'tldraw'

// ─── Type Registration ──────────────────────────────────────────────────────

export const WINDOW_TYPE = 'window' as const

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    window: {
      width: number    // cm
      sillDepth: number // cm (depth of sill = wall thickness typically)
    }
  }
}

export type WindowShape = TLShape<typeof WINDOW_TYPE>

// ─── ShapeUtil ──────────────────────────────────────────────────────────────

export class WindowShapeUtil extends ShapeUtil<WindowShape> {
  static override type = WINDOW_TYPE

  static override props = {
    width: T.number,
    sillDepth: T.number,
  }

  getDefaultProps(): WindowShape['props'] {
    return { width: 120, sillDepth: 20 }
  }

  getGeometry(shape: WindowShape) {
    return new Rectangle2d({
      width: shape.props.width,
      height: shape.props.sillDepth,
      isFilled: false,
    })
  }

  component(shape: WindowShape) {
    const { width, sillDepth } = shape.props
    const w = width
    const d = sillDepth

    // Classic architectural window symbol:
    // - Outer rectangle (opening in wall)
    // - Two inner lines (glass panes / frame)
    // - Sill lines at front

    return (
      <SVGContainer>
        {/* Opening rectangle */}
        <rect
          x={0} y={0}
          width={toDomPrecision(w)}
          height={toDomPrecision(d)}
          fill="rgba(200, 230, 255, 0.25)"
          stroke="#2c2c2c"
          strokeWidth={2}
        />
        {/* Center divider line (vertical) */}
        <line
          x1={toDomPrecision(w / 2)} y1={0}
          x2={toDomPrecision(w / 2)} y2={toDomPrecision(d)}
          stroke="#444"
          strokeWidth={1}
        />
        {/* Sill lines (front of window) */}
        <line
          x1={-4} y1={toDomPrecision(d)}
          x2={toDomPrecision(w + 4)} y2={toDomPrecision(d)}
          stroke="#2c2c2c"
          strokeWidth={2.5}
        />
      </SVGContainer>
    )
  }

  indicator(shape: WindowShape) {
    return (
      <rect
        width={shape.props.width}
        height={shape.props.sillDepth}
      />
    )
  }
}
