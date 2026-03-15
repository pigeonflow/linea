'use client'

import { useState, useEffect, useRef } from 'react'
import { getSunPosition, getSunPath, getSunTimes, KEY_DATES, DEFAULT_LOCATION, SunPathPoint } from '@/lib/sun/sunCalc'

import { SunState } from '@/lib/cad/serializeCanvas'

interface Location { lat: number; lng: number; label: string }

interface Props {
  onNorthAngle?: (deg: number) => void
  northAngle: number
  onSunState?: (state: SunState) => void
}

const CARD_LABELS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO']

export default function SunPanel({ northAngle, onNorthAngle, onSunState }: Props) {
  const [open, setOpen] = useState(false)
  const [location, setLocation] = useState<Location>(DEFAULT_LOCATION)
  const [locationInput, setLocationInput] = useState(DEFAULT_LOCATION.label)
  const [date, setDate] = useState(() => new Date())
  const [timeH, setTimeH] = useState(12)
  const [dateKey, setDateKey] = useState<'custom' | 'summer' | 'winter' | 'equinox'>('custom')
  const [path, setPath] = useState<SunPathPoint[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const currentDate = (() => {
    if (dateKey === 'summer') return KEY_DATES.summerSolstice
    if (dateKey === 'winter') return KEY_DATES.winterSolstice
    if (dateKey === 'equinox') return KEY_DATES.equinox
    return date
  })()

  const sunDate = new Date(currentDate)
  sunDate.setHours(timeH, 0, 0, 0)

  const sunPos = getSunPosition(location.lat, location.lng, sunDate)
  const sunTimes = getSunTimes(location.lat, location.lng, sunDate)

  useEffect(() => {
    setPath(getSunPath(location.lat, location.lng, currentDate))
  }, [location, currentDate])

  // Emit sun state whenever relevant values change
  useEffect(() => {
    if (!onSunState) return
    const pad = (n: number) => String(n).padStart(2, '0')
    onSunState({
      city: location.label,
      azimuthDeg: Math.round(sunPos.azimuth),
      altitudeDeg: Math.round(sunPos.altitude),
      time: `${pad(timeH)}:00`,
      date: sunDate.toISOString().slice(0, 10),
      northAngleDeg: northAngle,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, sunPos.azimuth, sunPos.altitude, timeH, northAngle])

  // Draw sun diagram
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || path.length === 0) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 16

    ctx.clearRect(0, 0, W, H)

    // Background circle
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = '#f0f4ff'
    ctx.fill()
    ctx.strokeStyle = '#dde'
    ctx.lineWidth = 1
    ctx.stroke()

    // Cardinal labels
    const cards = [['N', 0], ['L', 90], ['S', 180], ['O', 270]] as [string, number][]
    ctx.font = '10px sans-serif'
    ctx.fillStyle = '#888'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const [label, az] of cards) {
      const rad = ((az + northAngle) - 90) * Math.PI / 180
      ctx.fillText(label, cx + (R + 10) * Math.cos(rad), cy + (R + 10) * Math.sin(rad))
    }

    // Sun path arc
    ctx.beginPath()
    let first = true
    for (const pt of path) {
      if (pt.altitude < 0) continue
      const az = (pt.azimuth + northAngle - 90) * Math.PI / 180
      const altR = R * (1 - pt.altitude / 90)
      const x = cx + altR * Math.cos(az)
      const y = cy + altR * Math.sin(az)
      if (first) { ctx.moveTo(x, y); first = false }
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2
    ctx.stroke()

    // Current sun position
    if (sunPos.altitude > 0) {
      const az = (sunPos.azimuth + northAngle - 90) * Math.PI / 180
      const altR = R * (1 - sunPos.altitude / 90)
      const sx = cx + altR * Math.cos(az)
      const sy = cy + altR * Math.sin(az)
      ctx.beginPath()
      ctx.arc(sx, sy, 7, 0, Math.PI * 2)
      ctx.fillStyle = '#f59e0b'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }, [path, sunPos, northAngle])

  const fmt = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ position: 'absolute', top: 56, left: 60, zIndex: 500 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Ferramenta Solar"
        style={{
          width: 36, height: 36, borderRadius: 8, border: '1px solid #e0e0e0',
          background: open ? '#fff8e1' : 'white', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
        }}
      >☀️</button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, left: 0, width: 280,
          background: 'white', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          border: '1px solid #e8e8e8', padding: 16, zIndex: 600,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: '#1a1a2e' }}>
            ☀️ Trajetória Solar
          </div>

          {/* Location */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>Localização</label>
            <input
              value={locationInput}
              onChange={e => setLocationInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  // Simple preset detection
                  const v = locationInput.toLowerCase()
                  if (v.includes('rio')) setLocation({ lat: -22.9068, lng: -43.1729, label: locationInput })
                  else if (v.includes('brasília') || v.includes('brasilia')) setLocation({ lat: -15.7801, lng: -47.9292, label: locationInput })
                  else if (v.includes('belo') || v.includes('bh')) setLocation({ lat: -19.9167, lng: -43.9345, label: locationInput })
                  else if (v.includes('curitiba')) setLocation({ lat: -25.4284, lng: -49.2733, label: locationInput })
                  else setLocation({ ...DEFAULT_LOCATION, label: locationInput })
                }
              }}
              placeholder="Ex: São Paulo, SP"
              style={{
                width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #e0e0e0',
                fontSize: 12, boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
              Pressione Enter para aplicar ({location.lat.toFixed(2)}, {location.lng.toFixed(2)})
            </div>
          </div>

          {/* Date preset */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Data de referência</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {([['custom', 'Hoje'], ['summer', 'Verão'], ['winter', 'Inverno'], ['equinox', 'Equinócio']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setDateKey(k)} style={{
                  fontSize: 10, padding: '3px 7px', borderRadius: 5, cursor: 'pointer',
                  background: dateKey === k ? '#1a1a2e' : '#f5f5f5',
                  color: dateKey === k ? 'white' : '#555', border: 'none',
                }}>{label}</button>
              ))}
            </div>
          </div>

          {/* Time slider */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>
              Hora: {String(timeH).padStart(2, '0')}:00
              {sunPos.altitude > 0 ? ` — ${sunPos.azimuth.toFixed(0)}° az` : ' (noite)'}
            </label>
            <input type="range" min={0} max={23} value={timeH}
              onChange={e => setTimeH(Number(e.target.value))}
              style={{ width: '100%' }} />
          </div>

          {/* Sun diagram */}
          <canvas ref={canvasRef} width={248} height={180}
            style={{ borderRadius: 8, display: 'block', margin: '0 auto 10px' }} />

          {/* Sun times */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
            <div style={{ background: '#fff8e1', borderRadius: 6, padding: '6px 8px' }}>
              🌅 Nascer: <strong>{fmt(sunTimes.sunrise)}</strong>
            </div>
            <div style={{ background: '#e8f0ff', borderRadius: 6, padding: '6px 8px' }}>
              🌇 Pôr: <strong>{fmt(sunTimes.sunset)}</strong>
            </div>
          </div>

          {/* North angle */}
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>
              Rotação norte no canvas: {northAngle}°
            </label>
            <input type="range" min={-180} max={180} value={northAngle}
              onChange={e => onNorthAngle?.(Number(e.target.value))}
              style={{ width: '100%' }} />
            <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
              Ajuste para alinhar o norte do canvas com o norte real do terreno
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
