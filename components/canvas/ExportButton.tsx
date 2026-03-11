'use client'

import { Editor } from 'tldraw'
import { exportDxf, DxfEntity } from '@/lib/cad/exportDxf'
import { WALL_TYPE } from './shapes/WallShape'
import { DOOR_TYPE } from './shapes/DoorShape'
import { WINDOW_TYPE } from './shapes/WindowShape'
import { useState } from 'react'

interface Props {
  editor: Editor
}

export default function ExportButton({ editor }: Props) {
  const [exporting, setExporting] = useState(false)

  const handleExport = () => {
    setExporting(true)
    try {
      const shapes = editor.getCurrentPageShapes()
      const entities: DxfEntity[] = []

      for (const shape of shapes) {
        if (shape.type === WALL_TYPE) {
          const p = shape.props as { x1: number; y1: number; x2: number; y2: number; thickness: number; layer: string }
          entities.push({ type: 'wall', x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, thickness: p.thickness, layer: p.layer ?? 'walls' })
        } else if (shape.type === DOOR_TYPE) {
          const p = shape.props as { width: number; rotation: number; swing: string }
          entities.push({ type: 'door', x: shape.x, y: shape.y, width: p.width, rotation: p.rotation ?? 0, swing: p.swing })
        } else if (shape.type === WINDOW_TYPE) {
          const p = shape.props as { width: number }
          entities.push({ type: 'window', x: shape.x, y: shape.y, width: p.width, rotation: 0 })
        } else if (shape.type === 'text') {
          const p = shape.props as { richText?: { content?: { content?: { text?: string }[] }[] } }
          const text = p.richText?.content?.[0]?.content?.[0]?.text ?? ''
          if (text) entities.push({ type: 'annotation', x: shape.x, y: shape.y, text })
        }
      }

      const dxf = exportDxf(entities)
      const blob = new Blob([dxf], { type: 'application/dxf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'linea-export.dxf'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      title="Export as DXF (AutoCAD compatible)"
      style={{
        position: 'absolute',
        bottom: 16,
        right: 356,
        zIndex: 500,
        background: '#1a1a2e',
        color: 'white',
        border: 'none',
        borderRadius: 8,
        padding: '8px 14px',
        fontSize: 12,
        fontWeight: 600,
        cursor: exporting ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        opacity: exporting ? 0.7 : 1,
      }}
    >
      <span>⬇</span> Export DXF
    </button>
  )
}
