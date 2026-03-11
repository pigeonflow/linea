import {
  StateNode,
  TLPointerEventInfo,
  createShapeId,
  Vec,
} from 'tldraw'
import { WALL_TYPE } from './WallShape'
import { wallConfig } from '@/lib/cad/wallConfig'

// ─── Wall Tool ──────────────────────────────────────────────────────────────
// Two-click drawing: click to set start, move to preview, click to finish.
// Shift-constrains to 0°/45°/90° angles.

export class WallTool extends StateNode {
  static override id = 'wall'
  static override initial = 'idle'

  static override children = () => [WallIdle, WallPointing]

  override onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  override onExit() {
    this.editor.setCursor({ type: 'default', rotation: 0 })
  }
}

// ─── Idle state: waiting for first click ───────────────────────────────────

class WallIdle extends StateNode {
  static override id = 'idle'

  override onPointerDown(info: TLPointerEventInfo) {
    this.parent.transition('pointing', info)
  }
}

// ─── Pointing state: first point set, drawing in progress ─────────────────

class WallPointing extends StateNode {
  static override id = 'pointing'

  private shapeId = createShapeId()
  private startPoint = new Vec(0, 0)
  private SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]

  override onEnter(info: TLPointerEventInfo) {
    const { x, y } = this.editor.inputs.currentPagePoint
    this.startPoint = new Vec(x, y)
    this.shapeId = createShapeId()

    this.editor.createShape({
      id: this.shapeId,
      type: WALL_TYPE,
      x,
      y,
      props: {
        x1: x,
        y1: y,
        x2: x,
        y2: y,
        thickness: wallConfig.thickness,
        layer: 'walls',
      },
    })
  }

  override onPointerMove() {
    let { x, y } = this.editor.inputs.currentPagePoint
    const { x: sx, y: sy } = this.startPoint

    // Angle-snap when Shift is held
    if (this.editor.inputs.shiftKey) {
      const angle = Math.atan2(y - sy, x - sx)
      const deg = ((angle * 180) / Math.PI + 360) % 360
      const snapped = this.SNAP_ANGLES.reduce((a, b) =>
        Math.abs(b - deg) < Math.abs(a - deg) ? b : a
      )
      const snapRad = (snapped * Math.PI) / 180
      const dist = Math.sqrt((x - sx) ** 2 + (y - sy) ** 2)
      x = sx + Math.cos(snapRad) * dist
      y = sy + Math.sin(snapRad) * dist
    }

    this.editor.updateShape({
      id: this.shapeId,
      type: WALL_TYPE,
      props: {
        x2: x,
        y2: y,
      },
    })
  }

  override onPointerUp() {
    const { x, y } = this.editor.inputs.currentPagePoint
    const { x: sx, y: sy } = this.startPoint
    const dist = Math.sqrt((x - sx) ** 2 + (y - sy) ** 2)

    if (dist < 5) {
      // Too short — cancel
      this.editor.deleteShape(this.shapeId)
    }

    // Return to idle to allow chaining walls
    this.parent.transition('idle')
  }

  override onKeyDown(info: { key: string }) {
    if (info.key === 'Escape') {
      this.editor.deleteShape(this.shapeId)
      this.parent.transition('idle')
    }
  }
}
