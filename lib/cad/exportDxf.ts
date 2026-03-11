/**
 * Minimal DXF R12 exporter.
 * Converts Linea canvas shapes to a DXF string.
 * R12 is the most universally compatible format (AutoCAD, LibreCAD, etc.)
 */

export interface DxfWall {
  type: 'wall'
  x1: number; y1: number
  x2: number; y2: number
  thickness: number
  layer: string
}

export interface DxfDoor {
  type: 'door'
  x: number; y: number
  width: number
  rotation: number
  swing: string
}

export interface DxfWindow {
  type: 'window'
  x: number; y: number
  width: number
  rotation: number
}

export interface DxfAnnotation {
  type: 'annotation'
  x: number; y: number
  text: string
}

export type DxfEntity = DxfWall | DxfDoor | DxfWindow | DxfAnnotation

function line(x1: number, y1: number, x2: number, y2: number, layer = '0'): string {
  // DXF Y-axis is flipped vs screen coords
  return [
    '0', 'LINE',
    '8', layer,
    '10', x1.toFixed(4),
    '20', (-y1).toFixed(4),
    '30', '0.0',
    '11', x2.toFixed(4),
    '21', (-y2).toFixed(4),
    '31', '0.0',
  ].join('\n')
}

function arc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, layer = '0'): string {
  return [
    '0', 'ARC',
    '8', layer,
    '10', cx.toFixed(4),
    '20', (-cy).toFixed(4),
    '30', '0.0',
    '40', r.toFixed(4),
    '50', startAngle.toFixed(4),
    '51', endAngle.toFixed(4),
  ].join('\n')
}

function text(x: number, y: number, content: string, height = 20, layer = 'annotations'): string {
  return [
    '0', 'TEXT',
    '8', layer,
    '10', x.toFixed(4),
    '20', (-y).toFixed(4),
    '30', '0.0',
    '40', height.toFixed(4),
    '1', content,
  ].join('\n')
}

function wallToLines(w: DxfWall): string {
  const dx = w.x2 - w.x1
  const dy = w.y2 - w.y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.01) return ''

  const nx = -dy / len  // normal
  const ny =  dx / len
  const half = w.thickness / 2

  // Two parallel lines representing the wall faces
  const l1 = line(w.x1 + nx * half, w.y1 + ny * half, w.x2 + nx * half, w.y2 + ny * half, w.layer)
  const l2 = line(w.x1 - nx * half, w.y1 - ny * half, w.x2 - nx * half, w.y2 - ny * half, w.layer)
  // Centreline (dashed would require LTYPE setup — just draw it on a sub-layer)
  const cl = line(w.x1, w.y1, w.x2, w.y2, w.layer + '_cl')
  return [l1, l2, cl].join('\n')
}

function doorToEntities(d: DxfDoor): string {
  const rad = (d.rotation * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)

  // Door sill line
  const sill = line(d.x, d.y, d.x + cos * d.width, d.y + sin * d.width, 'doors')

  // Swing arc: 90° quarter circle from door edge
  const swingArc = arc(d.x, d.y, d.width, -d.rotation, -d.rotation + 90, 'doors')

  return [sill, swingArc].join('\n')
}

function windowToEntities(w: DxfWindow): string {
  const rad = (w.rotation * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const sillDepth = 20

  // Three parallel lines: outer face, inner face, mid glass line
  const nx = -sin, ny = cos

  const x2 = w.x + cos * w.width
  const y2 = w.y + sin * w.width

  const outer = line(w.x, w.y, x2, y2, 'windows')
  const inner = line(w.x + nx * sillDepth, w.y + ny * sillDepth, x2 + nx * sillDepth, y2 + ny * sillDepth, 'windows')
  const glass = line(w.x + nx * (sillDepth / 2), w.y + ny * (sillDepth / 2), x2 + nx * (sillDepth / 2), y2 + ny * (sillDepth / 2), 'windows')

  return [outer, inner, glass].join('\n')
}

function layerDef(name: string, color: number): string {
  return [
    '0', 'LAYER',
    '2', name,
    '70', '0',
    '62', color.toString(),
    '6', 'CONTINUOUS',
  ].join('\n')
}

export function exportDxf(entities: DxfEntity[]): string {
  const entityLines: string[] = []

  for (const e of entities) {
    if (e.type === 'wall') entityLines.push(wallToLines(e))
    else if (e.type === 'door') entityLines.push(doorToEntities(e))
    else if (e.type === 'window') entityLines.push(windowToEntities(e))
    else if (e.type === 'annotation') entityLines.push(text(e.x, e.y, e.text))
  }

  const layers = [
    layerDef('walls', 7),       // white/black
    layerDef('walls_cl', 8),    // grey
    layerDef('doors', 1),       // red
    layerDef('windows', 4),     // cyan
    layerDef('annotations', 3), // green
    layerDef('dimensions', 2),  // yellow
  ].join('\n')

  return [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER',
    '1', 'AC1009',  // R12
    '0', 'ENDSEC',

    '0', 'SECTION',
    '2', 'TABLES',
    '0', 'TABLE',
    '2', 'LAYER',
    '70', '6',
    layers,
    '0', 'ENDTAB',
    '0', 'ENDSEC',

    '0', 'SECTION',
    '2', 'ENTITIES',
    ...entityLines,
    '0', 'ENDSEC',

    '0', 'EOF',
  ].join('\n')
}
