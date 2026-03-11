'use client'

import { Editor } from 'tldraw'
import { useState, useEffect, useCallback } from 'react'

interface Layer {
  id: string
  label: string
  color: string
  visible: boolean
  locked: boolean
}

const DEFAULT_LAYERS: Layer[] = [
  { id: 'walls',       label: 'Walls',             color: '#2c2c2c', visible: true, locked: false },
  { id: 'openings',    label: 'Doors & Windows',   color: '#4a90d9', visible: true, locked: false },
  { id: 'dimensions',  label: 'Dimensions',        color: '#e07b39', visible: true, locked: false },
  { id: 'annotations', label: 'Annotations',       color: '#888888', visible: true, locked: false },
  { id: 'furniture',   label: 'Furniture',         color: '#7b61d4', visible: true, locked: false },
]

interface LayersPanelProps {
  editor: Editor
}

export default function LayersPanel({ editor }: LayersPanelProps) {
  const [open, setOpen] = useState(false)
  const [layers, setLayers] = useState<Layer[]>(DEFAULT_LAYERS)
  const [grid, setGrid] = useState(false)
  const [snap, setSnap] = useState(true)

  // Sync grid state from editor on mount
  useEffect(() => {
    setGrid(editor.getDocumentSettings().gridSize > 0 && (editor as unknown as { isGridMode?: boolean }).isGridMode === true)
  }, [editor])

  const toggleGrid = useCallback(() => {
    const next = !grid
    setGrid(next)
    editor.updateDocumentSettings({ gridSize: next ? 10 : 0 })
  }, [grid, editor])

  const toggleSnap = useCallback(() => {
    const next = !snap
    setSnap(next)
    // tldraw user preferences
    editor.user.updateUserPreferences({ isSnapMode: next })
  }, [snap, editor])

  const toggleLayerVisibility = useCallback((id: string) => {
    setLayers(prev => prev.map(l =>
      l.id === id ? { ...l, visible: !l.visible } : l
    ))
    // Hide/show shapes on this layer by setting opacity
    // tldraw doesn't have native layers; we filter by props.layer
    const shapes = editor.getCurrentPageShapes()
    const targets = shapes.filter(s => (s.props as Record<string, unknown>).layer === id)
    if (targets.length === 0) return
    const layer = layers.find(l => l.id === id)
    const willBeVisible = layer ? !layer.visible : true
    editor.updateShapes(targets.map(s => ({
      id: s.id,
      type: s.type,
      opacity: willBeVisible ? 1 : 0.05,
    })))
  }, [editor, layers])

  const toggleLayerLock = useCallback((id: string) => {
    setLayers(prev => prev.map(l =>
      l.id === id ? { ...l, locked: !l.locked } : l
    ))
    const shapes = editor.getCurrentPageShapes()
    const targets = shapes.filter(s => (s.props as Record<string, unknown>).layer === id)
    if (targets.length === 0) return
    const layer = layers.find(l => l.id === id)
    const willBeLocked = layer ? !layer.locked : false
    editor.updateShapes(targets.map(s => ({
      id: s.id,
      type: s.type,
      isLocked: willBeLocked,
    })))
  }, [editor, layers])

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Layers (L)"
        style={{
          position: 'absolute',
          right: open ? 560 : 356,
          top: 72,
          width: 36,
          height: 36,
          borderRadius: 8,
          background: open ? '#1a1a2e' : 'white',
          color: open ? 'white' : '#444',
          border: '1px solid #e0e0e0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          zIndex: 500,
          transition: 'right 0.2s ease',
        }}
      >
        ≡
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'absolute',
          right: 356,
          top: 64,
          width: 200,
          background: 'white',
          borderRadius: 12,
          border: '1px solid #e8e8e8',
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          zIndex: 499,
          overflow: 'hidden',
          fontFamily: 'system-ui, sans-serif',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid #f0f0f0',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: '#888',
            textTransform: 'uppercase',
          }}>
            Layers
          </div>

          {/* Layer rows */}
          <div style={{ padding: '6px 0' }}>
            {layers.map(layer => (
              <div key={layer.id} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '5px 12px',
                gap: 8,
                cursor: 'default',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f8f8f8')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Color dot */}
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: layer.color, flexShrink: 0,
                }} />

                {/* Label */}
                <span style={{
                  flex: 1, fontSize: 12, color: layer.visible ? '#333' : '#bbb',
                  textDecoration: layer.locked ? 'none' : 'none',
                }}>
                  {layer.label}
                </span>

                {/* Lock */}
                <button
                  onClick={() => toggleLayerLock(layer.id)}
                  title={layer.locked ? 'Unlock' : 'Lock'}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 11, color: layer.locked ? '#e07b39' : '#ccc',
                    padding: 2, lineHeight: 1,
                  }}
                >
                  {layer.locked ? '🔒' : '🔓'}
                </button>

                {/* Visibility */}
                <button
                  onClick={() => toggleLayerVisibility(layer.id)}
                  title={layer.visible ? 'Hide' : 'Show'}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 11, color: layer.visible ? '#555' : '#ccc',
                    padding: 2, lineHeight: 1,
                  }}
                >
                  {layer.visible ? '👁' : '👁‍🗨'}
                </button>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #f0f0f0', margin: '4px 0' }} />

          {/* Grid + Snap toggles */}
          <div style={{ padding: '6px 12px 10px' }}>
            <ToggleRow
              label="Grid"
              hint="10cm"
              active={grid}
              onToggle={toggleGrid}
            />
            <ToggleRow
              label="Snap to grid"
              active={snap}
              onToggle={toggleSnap}
            />
          </div>
        </div>
      )}
    </>
  )
}

function ToggleRow({ label, hint, active, onToggle }: {
  label: string
  hint?: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      padding: '4px 0',
    }}>
      <span style={{ fontSize: 12, color: '#444' }}>
        {label}
        {hint && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 4 }}>{hint}</span>}
      </span>
      <button
        onClick={onToggle}
        style={{
          width: 32, height: 18, borderRadius: 9,
          background: active ? '#1a1a2e' : '#ddd',
          border: 'none', cursor: 'pointer',
          position: 'relative', transition: 'background 0.15s',
        }}
      >
        <span style={{
          position: 'absolute',
          top: 2, left: active ? 16 : 2,
          width: 14, height: 14, borderRadius: '50%',
          background: 'white',
          transition: 'left 0.15s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  )
}
