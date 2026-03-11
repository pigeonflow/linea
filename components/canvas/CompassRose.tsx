'use client'

interface Props {
  northAngle: number  // degrees — 0 = canvas up is true north
}

export default function CompassRose({ northAngle }: Props) {
  const size = 52
  const cx = size / 2, cy = size / 2
  const r = 20
  const rad = (deg: number) => (deg - 90) * Math.PI / 180

  // North pointer direction (rotated by northAngle)
  const nRad = rad(northAngle)
  const sRad = rad(northAngle + 180)

  const pt = (angle: number, dist: number) => ({
    x: cx + dist * Math.cos(rad(angle)),
    y: cy + dist * Math.sin(rad(angle)),
  })

  const nTip = pt(northAngle, r)
  const sTip = pt(northAngle + 180, r * 0.7)
  const lWing = pt(northAngle + 90, 6)
  const rWing = pt(northAngle - 90, 6)
  const eTip = pt(northAngle + 90, r * 0.55)
  const wTip = pt(northAngle - 90, r * 0.55)

  return (
    <div style={{
      position: 'absolute', bottom: 60, left: 16, zIndex: 500,
      background: 'white', borderRadius: '50%', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      border: '1px solid #e0e0e0',
      width: size, height: size,
    }}>
      <svg width={size} height={size} style={{ display: 'block' }}>
        {/* North arrow — red */}
        <polygon
          points={`${nTip.x},${nTip.y} ${lWing.x},${lWing.y} ${cx},${cy} ${rWing.x},${rWing.y}`}
          fill="#dc2626"
        />
        {/* South arrow — grey */}
        <polygon
          points={`${sTip.x},${sTip.y} ${lWing.x},${lWing.y} ${cx},${cy} ${rWing.x},${rWing.y}`}
          fill="#aaa"
        />
        {/* E / W ticks */}
        <line x1={eTip.x} y1={eTip.y} x2={cx} y2={cy} stroke="#ccc" strokeWidth={1} />
        <line x1={wTip.x} y1={wTip.y} x2={cx} y2={cy} stroke="#ccc" strokeWidth={1} />
        {/* N label */}
        <text
          x={nTip.x + Math.cos(nRad) * 8}
          y={nTip.y + Math.sin(nRad) * 8}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={8} fontWeight="bold" fill="#dc2626"
        >N</text>
      </svg>
    </div>
  )
}
