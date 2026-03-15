'use client'

import { Tldraw, Editor, createShapeId, TLShapeId } from 'tldraw'
import 'tldraw/tldraw.css'
import { useCallback, useRef, useState } from 'react'
import SunPanel from './SunPanel'
import VizinhoPanel, { SiteContext } from './VizinhoPanel'
import CompassRose from './CompassRose'
import CommandBar from './CommandBar'
import { serializeCanvas, captureCanvasImage, SunState } from '@/lib/cad/serializeCanvas'
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
  const [sunState, setSunState] = useState<SunState | null>(null)
  const lastRoom = useRef<RoomRef | null>(null)
  const lastVpOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  // Accumulate rooms drawn via streaming so we can do topology after a batch
  const streamingRooms = useRef<Extract<CADCommand, { action: 'draw_room' }>[]>([])

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
        const doorWidth = command.width ?? 90
        const rotation = command.rotation ?? 0
        const isVertical = Math.abs(rotation % 180) === 90
        // Door shape bounding box: doorWidth × (doorWidth + 10)
        // Opening is at y=0 (top edge), centered at x=doorWidth/2
        // For horizontal (rotation=0): place so opening center lands at (px, py)
        //   → shape x = px - doorWidth/2, y = py
        // For vertical (rotation=90°): tldraw rotates around shape center
        //   After π/2 rotation, opening center maps to (x + doorWidth + 5, y + (doorWidth+10)/2)
        //   → x = px - doorWidth - 5, y = py - (doorWidth + 10) / 2
        const sx = isVertical ? px - doorWidth - 5       : px - doorWidth / 2
        const sy = isVertical ? py - (doorWidth + 10) / 2 : py
        editor.createShape({
          id: createShapeId(), type: DOOR_TYPE,
          x: sx, y: sy,
          rotation: isVertical ? Math.PI / 2 : 0,
          props: {
            width: doorWidth,
            swing: command.swingDirection === 'double' ? 'double'
              : command.swingDirection === 'sliding' ? 'sliding'
              : command.swingDirection === 'right' ? 'right' : 'left',
            rotation,
          },
        })
        break
      }

      case 'place_window': {
        const px = vpOffset.x + (command.position?.[0] ?? 0)
        const py = vpOffset.y + (command.position?.[1] ?? 0)
        const rotation = command.rotation ?? 0
        const isVertical = Math.abs(rotation % 180) === 90
        const width = command.width ?? 120
        const sillDepth = 20
        editor.createShape({
          id: createShapeId(), type: WINDOW_TYPE,
          x: isVertical ? px - sillDepth / 2 : px - width / 2,
          y: isVertical ? py - width / 2    : py - sillDepth / 2,
          props: { width, sillDepth, rotation },
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

      case 'delete_element': {
        // Find shape(s) matching the label — geo shapes have a label prop
        const shapes = editor.getCurrentPageShapes()
        const toDelete = shapes.filter(s => {
          const p = s.props as unknown as Record<string, unknown>
          const lbl = (p.label as string ?? '').toLowerCase()
          return lbl === (command.label ?? '').toLowerCase()
        })
        if (toDelete.length > 0) {
          editor.deleteShapes(toDelete.map(s => s.id))
        }
        break
      }

      case 'clear_canvas': {
        const allIds = [...editor.getCurrentPageShapeIds()]
        if (allIds.length > 0) editor.deleteShapes(allIds)
        break
      }

      case 'select_all':
        editor.selectAll()
        break
    }
  }, [editor])

  // Called per draw event from SSE stream — live canvas update
  const executeStream = useCallback((rawCommand: Record<string, unknown>) => {
    if (!editor) return
    const parse = CADCommand.safeParse(rawCommand)
    if (!parse.success) return
    const command = parse.data
    const wallIds: TLShapeId[] = []

    if (command.action === 'draw_room') {
      if (streamingRooms.current.length === 0) {
        const vp = getVpCenter(editor)
        const vpOffset = { x: vp.x - (command.origin?.[0] ?? 0) - command.width / 2, y: vp.y - (command.origin?.[1] ?? 0) - command.height / 2 }
        lastVpOffset.current = vpOffset
        setLotOrigin(vpOffset)
      }
      streamingRooms.current.push(command)
      buildWallTopology(editor, streamingRooms.current.map(r => ({
        ox: r.origin?.[0] ?? 0, oy: r.origin?.[1] ?? 0,
        width: r.width, height: r.height, thickness: r.wallThickness ?? 20,
      })), lastVpOffset.current)
      executeOne(command, lastVpOffset.current, wallIds)
    } else {
      if (command.action === 'clear_canvas') streamingRooms.current = []
      executeOne(command, lastVpOffset.current, wallIds)
    }
  }, [editor, executeOne])

  const finalizeStream = useCallback(() => { streamingRooms.current = [] }, [])

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
          <SunPanel northAngle={northAngle} onNorthAngle={setNorthAngle} onSunState={setSunState} />
          <VizinhoPanel editor={editor} onSiteContext={setSiteContext} canvasOrigin={lotOrigin} />
          <CompassRose northAngle={northAngle} />
          <ExportButton editor={editor} />
          <CommandBar
            onCommands={executeCommands}
            onStreamCommand={executeStream}
            onStreamDone={finalizeStream}
            siteContext={siteContext}
            getCanvasState={() => editor ? serializeCanvas(editor, {
              vpOffset: lastVpOffset.current,
              sun: sunState ?? undefined,
              site: siteContext ? {
                city: siteContext.city,
                lotWidthM: siteContext.lot.width / 100,
                lotHeightM: siteContext.lot.height / 100,
                setbacks: {
                  frontalM: siteContext.rules.frontal / 100,
                  lateralM: siteContext.rules.lateral / 100,
                  fundosM: siteContext.rules.fundos / 100,
                },
                buildableAreaSqM: Math.round(
                  ((siteContext.lot.width - siteContext.rules.lateral * 2) / 100) *
                  ((siteContext.lot.height - siteContext.rules.frontal - siteContext.rules.fundos) / 100)
                ),
              } : undefined,
            }) : null}
            getCanvasImage={() => editor ? captureCanvasImage(editor) : Promise.resolve(null)}
          />
        </>
      )}
    </div>
  )
}
