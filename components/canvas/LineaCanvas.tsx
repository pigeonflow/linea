'use client'

import { Tldraw, Editor, createShapeId, TLShapeId } from 'tldraw'
import 'tldraw/tldraw.css'
import { useCallback, useRef, useState } from 'react'
import SunPanel from './SunPanel'
import VizinhoPanel, { SiteContext } from './VizinhoPanel'
import CompassRose from './CompassRose'
import CommandBar from './CommandBar'
import { CADCommand } from '@/lib/cad/commands'
import { WallShapeUtil, WALL_TYPE } from './shapes/WallShape'
import { WallTool } from './shapes/WallTool'
import { DoorShapeUtil, DOOR_TYPE } from './shapes/DoorShape'
import { WindowShapeUtil, WINDOW_TYPE } from './shapes/WindowShape'
import { DoorTool, WindowTool } from './shapes/OpeningTools'
import Toolbar from './Toolbar'
import LayersPanel from './LayersPanel'
import ExportButton from './ExportButton'
import { buildWallTopology } from '@/lib/cad/buildWallTopology'

const SHAPE_UTILS = [WallShapeUtil, DoorShapeUtil, WindowShapeUtil]
const TOOLS = [WallTool, DoorTool, WindowTool]

interface RoomRef { ox: number; oy: number; width: number; height: number }

function getVpCenter(editor: Editor) {
  const b = editor.getViewportPageBounds()
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

export default function LineaCanvas() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [activeTool, setActiveTool] = useState('select')
  const [northAngle, setNorthAngle] = useState(0)
  const [siteContext, setSiteContext] = useState<SiteContext | null>(null)
  const [lotOrigin, setLotOrigin] = useState<{ x: number; y: number } | null>(null)
  const lastRoom = useRef<RoomRef | null>(null)
  const lastVpOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const handleMount = useCallback((ed: Editor) => setEditor(ed), [])

  const handleToolSelect = useCallback((tool: string) => {
    if (!editor) return
    editor.setCurrentTool(tool)
    setActiveTool(tool)
  }, [editor])

  const executeOne = useCallback((command: CADCommand, vpOffset: { x: number; y: number }, wallIds: TLShapeId[]) => {
    if (!editor) return

    switch (command.action) {

      case 'draw_wall': {
        const fx = vpOffset.x + command.from[0], fy = vpOffset.y + command.from[1]
        const tx = vpOffset.x + command.to[0],   ty = vpOffset.y + command.to[1]
        const id = createShapeId()
        wallIds.push(id)
        editor.createShape({
          id, type: WALL_TYPE, x: fx, y: fy,
          props: { x1: fx, y1: fy, x2: tx, y2: ty, thickness: command.thickness, layer: command.layer },
        })
        break
      }

      case 'draw_room': {
        // Walls handled by buildWallTopology — only draw the label here
        const { origin, width, height } = command
        const ox = vpOffset.x + (origin?.[0] ?? 0)
        const oy = vpOffset.y + (origin?.[1] ?? 0)
        if (command.label) {
          editor.createShape({
            id: createShapeId(), type: 'text',
            x: ox + width / 2 - 40, y: oy + height / 2 - 8,
            props: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: command.label }] }] }, size: 's', color: 'black' },
          })
        }
        break
      }

      case 'place_door': {
        const px = vpOffset.x + (command.position?.[0] ?? 0)
        const py = vpOffset.y + (command.position?.[1] ?? 0)
        editor.createShape({
          id: createShapeId(), type: DOOR_TYPE, x: px, y: py,
          props: {
            width: command.width,
            swing: command.swingDirection === 'double' ? 'double'
              : command.swingDirection === 'sliding' ? 'sliding'
              : command.swingDirection === 'right' ? 'right' : 'left',
            rotation: command.rotation,
          },
        })
        break
      }

      case 'place_window': {
        const px = vpOffset.x + (command.position?.[0] ?? 0)
        const py = vpOffset.y + (command.position?.[1] ?? 0)
        editor.createShape({
          id: createShapeId(), type: WINDOW_TYPE, x: px, y: py,
          props: { width: command.width, sillDepth: 20 },
        })
        break
      }

      case 'add_annotation': {
        const px = vpOffset.x + (command.position?.[0] ?? 0)
        const py = vpOffset.y + (command.position?.[1] ?? 0)
        editor.createShape({
          id: createShapeId(), type: 'text', x: px, y: py,
          props: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: command.text }] }] }, size: 's', color: 'black' },
        })
        break
      }

      case 'delete_selection':
        editor.deleteShapes(editor.getSelectedShapeIds())
        break

      case 'select_all':
        editor.selectAll()
        break
    }
  }, [editor])

  const executeCommands = useCallback((commands: CADCommand[]) => {
    if (!editor) return
    lastRoom.current = null
    const hasRoom = commands.some(c => c.action === 'draw_room')
    const vp = getVpCenter(editor)

    if (hasRoom) {
      const rooms = commands.filter(c => c.action === 'draw_room') as Extract<CADCommand, { action: 'draw_room' }>[]
      const minX = Math.min(...rooms.map(r => r.origin?.[0] ?? 0))
      const minY = Math.min(...rooms.map(r => r.origin?.[1] ?? 0))
      const maxX = Math.max(...rooms.map(r => (r.origin?.[0] ?? 0) + r.width))
      const maxY = Math.max(...rooms.map(r => (r.origin?.[1] ?? 0) + r.height))
      const vpOffset = { x: vp.x - (minX + maxX) / 2, y: vp.y - (minY + maxY) / 2 }
      lastVpOffset.current = vpOffset
      setLotOrigin(vpOffset)

      const first = rooms[0]
      lastRoom.current = {
        ox: vpOffset.x + (first.origin?.[0] ?? 0),
        oy: vpOffset.y + (first.origin?.[1] ?? 0),
        width: first.width,
        height: first.height,
      }

      // Build walls topologically — no doubles, no interior walls, clean junctions
      buildWallTopology(editor, rooms.map(r => ({
        ox: r.origin?.[0] ?? 0,
        oy: r.origin?.[1] ?? 0,
        width: r.width,
        height: r.height,
        thickness: r.wallThickness ?? 20,
      })), vpOffset)

      // Draw labels, doors, windows, annotations — include draw_room for labels
      const wallIds: TLShapeId[] = []
      commands.forEach(c => executeOne(c, vpOffset, wallIds))
    } else {
      const wallIds: TLShapeId[] = []
      commands.forEach(c => executeOne(c, lastVpOffset.current, wallIds))
    }
  }, [editor, executeOne])

  return (
    <div className="relative w-full h-full">
      <Tldraw
        onMount={handleMount}
        shapeUtils={SHAPE_UTILS}
        tools={TOOLS}
      />
      {editor && (
        <>
          <Toolbar activeTool={activeTool} onSelect={handleToolSelect} />
          <LayersPanel editor={editor} />
          <SunPanel northAngle={northAngle} onNorthAngle={setNorthAngle} />
          <VizinhoPanel editor={editor} onSiteContext={setSiteContext} canvasOrigin={lotOrigin} />
          <CompassRose northAngle={northAngle} />
          <ExportButton editor={editor} />
          <CommandBar onCommands={executeCommands} siteContext={siteContext} />
        </>
      )}
    </div>
  )
}
