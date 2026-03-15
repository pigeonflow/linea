import {
  ShapeUtil,
  SVGContainer,
  Rectangle2d,
  TLShape,
  T,
  toDomPrecision,
} from 'tldraw'

export const WINDOW_TYPE = 'window' as const

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    window: {
      width: number
      sillDepth: number
      rotation: number  // degrees: 0=horizontal (N/S wall), 90=vertical (E/W wall)
    }
  }
}

export type WindowShape = TLShape<typeof WINDOW_TYPE>

export class WindowShapeUtil extends ShapeUtil<WindowShape> {
  static override type = WINDOW_TYPE

  static override props = {
    width: T.number,
    sillDepth: T.number,
    rotation: T.number,
  }

  getDefaultProps(): WindowShape['props'] {
    return { width: 120, sillDepth: 20, rotation: 0 }
  }

  getGeometry(shape: WindowShape) {
    const { width, sillDepth, rotation } = shape.props
    // When rotated 90°, swap width/height for hit testing
    const isVertical = Math.abs(rotation % 180) === 90
    return new Rectangle2d({
      width:  isVertical ? sillDepth : width,
      height: isVertical ? width : sillDepth,
      isFilled: false,
    })
  }

  component(shape: WindowShape) {
    const { width, sillDepth, rotation } = shape.props
    const isVertical = Math.abs(rotation % 180) === 90

    if (isVertical) {
      // Vertical window: long axis top-to-bottom
      // Bounding box: sillDepth wide × width tall
      const w = sillDepth  // horizontal extent
      const h = width      // vertical extent
      return (
        <SVGContainer>
          <rect x={0} y={0} width={toDomPrecision(w)} height={toDomPrecision(h)}
            fill="rgba(200,230,255,0.3)" stroke="#2c2c2c" strokeWidth={2} />
          {/* Center divider (horizontal) */}
          <line x1={0} y1={toDomPrecision(h/2)} x2={toDomPrecision(w)} y2={toDomPrecision(h/2)}
            stroke="#444" strokeWidth={1} />
          {/* Sill line on right edge */}
          <line x1={toDomPrecision(w)} y1={-4} x2={toDomPrecision(w)} y2={toDomPrecision(h+4)}
            stroke="#2c2c2c" strokeWidth={2.5} />
        </SVGContainer>
      )
    }

    // Horizontal window: long axis left-to-right
    const w = width
    const d = sillDepth
    return (
      <SVGContainer>
        <rect x={0} y={0} width={toDomPrecision(w)} height={toDomPrecision(d)}
          fill="rgba(200,230,255,0.3)" stroke="#2c2c2c" strokeWidth={2} />
        {/* Center divider (vertical) */}
        <line x1={toDomPrecision(w/2)} y1={0} x2={toDomPrecision(w/2)} y2={toDomPrecision(d)}
          stroke="#444" strokeWidth={1} />
        {/* Sill line at bottom */}
        <line x1={-4} y1={toDomPrecision(d)} x2={toDomPrecision(w+4)} y2={toDomPrecision(d)}
          stroke="#2c2c2c" strokeWidth={2.5} />
      </SVGContainer>
    )
  }

  indicator(shape: WindowShape) {
    const { width, sillDepth, rotation } = shape.props
    const isVertical = Math.abs(rotation % 180) === 90
    return <rect width={isVertical ? sillDepth : width} height={isVertical ? width : sillDepth} />
  }
}
