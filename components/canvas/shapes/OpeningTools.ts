import { StateNode, TLPointerEventInfo, createShapeId } from 'tldraw'
import { DOOR_TYPE } from './DoorShape'
import { WINDOW_TYPE } from './WindowShape'

// ─── Door Tool ──────────────────────────────────────────────────────────────

export class DoorTool extends StateNode {
  static override id = 'door'
  static override initial = 'idle'
  static override children = () => [DoorIdle]

  override onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }
  override onExit() {
    this.editor.setCursor({ type: 'default', rotation: 0 })
  }
}

class DoorIdle extends StateNode {
  static override id = 'idle'

  override onPointerDown(info: TLPointerEventInfo) {
    const { x, y } = this.editor.inputs.currentPagePoint
    const id = createShapeId()
    this.editor.createShape({
      id,
      type: DOOR_TYPE,
      x: x - 45, // center the door on click
      y: y - 10,
      props: { width: 90, swing: 'left', rotation: 0 },
    })
    // Select it immediately so user can rotate/move
    this.editor.setSelectedShapes([id])
    this.editor.setCurrentTool('select')
  }
}

// ─── Window Tool ────────────────────────────────────────────────────────────

export class WindowTool extends StateNode {
  static override id = 'window'
  static override initial = 'idle'
  static override children = () => [WindowIdle]

  override onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }
  override onExit() {
    this.editor.setCursor({ type: 'default', rotation: 0 })
  }
}

class WindowIdle extends StateNode {
  static override id = 'idle'

  override onPointerDown(info: TLPointerEventInfo) {
    const { x, y } = this.editor.inputs.currentPagePoint
    const id = createShapeId()
    this.editor.createShape({
      id,
      type: WINDOW_TYPE,
      x: x - 60, // center on click
      y: y - 10,
      props: { width: 120, sillDepth: 20 },
    })
    this.editor.setSelectedShapes([id])
    this.editor.setCurrentTool('select')
  }
}
