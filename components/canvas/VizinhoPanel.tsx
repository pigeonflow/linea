'use client'

import { useState } from 'react'
import { Editor, createShapeId } from 'tldraw'

interface SetbackRule {
  frontal: number   // cm
  lateral: number
  fundos: number
}

const CITY_RULES: Record<string, SetbackRule> = {
  'São Paulo':  { frontal: 500, lateral: 150, fundos: 300 },
  'Rio de Janeiro': { frontal: 500, lateral: 150, fundos: 300 },
  'Curitiba':   { frontal: 400, lateral: 150, fundos: 200 },
  'Belo Horizonte': { frontal: 500, lateral: 150, fundos: 250 },
  'default':    { frontal: 500, lateral: 150, fundos: 300 },
}

interface LotDimensions {
  width: number   // cm
  height: number  // cm
}

export interface SiteContext {
  city: string
  lot: { width: number; height: number }
  rules: SetbackRule
}

interface Props {
  editor: Editor
  onSiteContext?: (ctx: SiteContext) => void
  canvasOrigin?: { x: number; y: number } | null  // vpOffset from LineaCanvas
}

export default function VizinhoPanel({ editor, onSiteContext, canvasOrigin }: Props) {
  const [open, setOpen] = useState(false)
  const [city, setCity] = useState('São Paulo')
  const [lot, setLot] = useState<LotDimensions>({ width: 2500, height: 2500 })
  const [zonesVisible, setZonesVisible] = useState(false)
  const [zoneIds, setZoneIds] = useState<string[]>([])

  const rules = CITY_RULES[city] ?? CITY_RULES['default']

  // Notify parent whenever city or lot changes
  const notify = (newCity: string, newLot: LotDimensions) => {
    const r = CITY_RULES[newCity] ?? CITY_RULES['default']
    onSiteContext?.({ city: newCity, lot: newLot, rules: r })
  }

  const drawZones = () => {
    // Remove existing zones
    if (zoneIds.length > 0) {
      editor.deleteShapes(zoneIds as unknown as Parameters<typeof editor.deleteShapes>[0])
      setZoneIds([])
      if (zonesVisible) { setZonesVisible(false); return }
    }

    const vp = editor.getViewportPageBounds()
    // Use canvasOrigin (same as vpOffset for rooms) if available, else viewport center
    const ox = canvasOrigin ? canvasOrigin.x : vp.x + vp.w / 2 - lot.width / 2
    const oy = canvasOrigin ? canvasOrigin.y : vp.y + vp.h / 2 - lot.height / 2

    const newIds: string[] = []

    // Draw lot boundary
    const lotId = createShapeId()
    editor.createShape({
      id: lotId, type: 'geo', x: ox, y: oy,
      props: { w: lot.width, h: lot.height, geo: 'rectangle', fill: 'none', color: 'blue', dash: 'dashed', size: 's' },
    })
    newIds.push(lotId as string)

    // Draw setback zones as semi-transparent rectangles
    const zones = [
      { label: 'Frontal', x: ox, y: oy, w: lot.width, h: rules.frontal, opacity: 0.15 },
      { label: 'Fundos',  x: ox, y: oy + lot.height - rules.fundos, w: lot.width, h: rules.fundos, opacity: 0.15 },
      { label: 'Lateral E', x: ox, y: oy + rules.frontal, w: rules.lateral, h: lot.height - rules.frontal - rules.fundos, opacity: 0.15 },
      { label: 'Lateral D', x: ox + lot.width - rules.lateral, y: oy + rules.frontal, w: rules.lateral, h: lot.height - rules.frontal - rules.fundos, opacity: 0.15 },
    ]

    for (const z of zones) {
      const id = createShapeId()
      editor.createShape({
        id, type: 'geo', x: z.x, y: z.y,
        props: { w: z.w, h: z.h, geo: 'rectangle', fill: 'solid', color: 'red', dash: 'draw', size: 's' },
      } as Parameters<typeof editor.createShape>[0])
      // Label
      const labelId = createShapeId()
      editor.createShape({
        id: labelId, type: 'text', x: z.x + z.w / 2 - 30, y: z.y + z.h / 2 - 8,
        props: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `${z.label} (${z.w === rules.lateral ? rules.lateral / 100 : z.h === rules.frontal ? rules.frontal / 100 : rules.fundos / 100}m)` }] }] }, size: 's', color: 'red' },
      })
      newIds.push(id as string, labelId as string)
    }

    setZoneIds(newIds)
    setZonesVisible(true)

    // Zoom to fit the entire lot so user can see all zones + rooms
    setTimeout(() => {
      editor.zoomToBounds({ x: ox, y: oy, w: lot.width, h: lot.height }, { animation: { duration: 400 }, inset: 60 })
    }, 50)
  }

  return (
    <div style={{ position: 'absolute', top: 100, left: 60, zIndex: 500 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Vizinho — Afastamentos NBR"
        style={{
          width: 36, height: 36, borderRadius: 8, border: '1px solid #e0e0e0',
          background: open ? '#fff0f0' : 'white', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
        }}
      >🏘️</button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, left: 0, width: 260,
          background: 'white', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          border: '1px solid #e8e8e8', padding: 16, zIndex: 600,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: '#1a1a2e' }}>
            🏘️ Vizinho — Afastamentos
          </div>

          {/* City */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>Município</label>
            <select value={city} onChange={e => { setCity(e.target.value); notify(e.target.value, lot) }}
              style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: 12 }}>
              {Object.keys(CITY_RULES).filter(k => k !== 'default').map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Setback rules display */}
          <div style={{ background: '#fafafa', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: '#555' }}>Afastamentos mínimos</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <div>🔵 Frontal: <strong>{rules.frontal / 100}m</strong></div>
              <div>🔴 Fundos: <strong>{rules.fundos / 100}m</strong></div>
              <div>🟡 Lateral: <strong>{rules.lateral / 100}m</strong></div>
              <div style={{ fontSize: 10, color: '#aaa' }}>CC Art. 1301</div>
            </div>
          </div>

          {/* Lot dimensions */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 6 }}>Dimensões do terreno</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>Largura (m)</div>
                <input type="number" value={lot.width / 100}
                  onChange={e => { const w = Number(e.target.value) * 100; setLot(l => { const n = {...l, width: w}; notify(city, n); return n }); }}
                  style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: 12, boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>Comprimento (m)</div>
                <input type="number" value={lot.height / 100}
                  onChange={e => { const h = Number(e.target.value) * 100; setLot(l => { const n = {...l, height: h}; notify(city, n); return n }); }}
                  style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: 12, boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>

          <button onClick={drawZones} style={{
            width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
            background: zonesVisible ? '#fee2e2' : '#1a1a2e',
            color: zonesVisible ? '#dc2626' : 'white',
            fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }}>
            {zonesVisible ? '✕ Remover zonas do canvas' : '🗺️ Mostrar afastamentos no canvas'}
          </button>

          <div style={{ marginTop: 10, fontSize: 10, color: '#aaa', lineHeight: 1.5 }}>
            As áreas vermelhas indicam onde <strong>não é permitido</strong> abrir janelas ou construir próximo ao vizinho (CC Art. 1301 + código municipal).
          </div>
        </div>
      )}
    </div>
  )
}


