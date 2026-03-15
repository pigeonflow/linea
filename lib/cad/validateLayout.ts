export interface Room {
  id?: string
  label?: string
  origin: [number, number]
  width: number
  height: number
  wallThickness?: number
}

export interface Door {
  position: [number, number]
  width?: number
  rotation?: number
}

export interface Window {
  position: [number, number]
  width?: number
  rotation?: number
}

export interface Violation {
  severity: 'error' | 'warning'
  code: string
  message: string
  element?: string
}

const MIN_AREAS: Record<string, number> = {
  quarto: 750,        // 7.5m² in cm²
  'quarto solteiro': 750,
  'quarto casal': 900,
  'suíte': 900,
  'suíte master': 900,
  dormitório: 750,
  sala: 1200,
  'sala de estar': 1200,
  cozinha: 550,
  banheiro: 250,
  'banheiro social': 250,
  lavanderia: 200,
}

function getMinArea(label: string): number | null {
  const l = label.toLowerCase()
  for (const [key, val] of Object.entries(MIN_AREAS)) {
    if (l.includes(key)) return val
  }
  return null
}

function isHabitable(label: string): boolean {
  const l = label.toLowerCase()
  return l.includes('quarto') || l.includes('sala') || l.includes('cozinha') ||
         l.includes('dormitório') || l.includes('suíte') || l.includes('escritório') ||
         l.includes('varanda') || l.includes('living')
}

function overlap(a: Room, b: Room): boolean {
  const ax2 = a.origin[0] + a.width
  const ay2 = a.origin[1] + a.height
  const bx2 = b.origin[0] + b.width
  const by2 = b.origin[1] + b.height
  return a.origin[0] < bx2 && ax2 > b.origin[0] &&
         a.origin[1] < by2 && ay2 > b.origin[1]
}

function pointNearWall(pos: [number, number], room: Room, tol = 60): boolean {
  const [px, py] = pos
  const [rx, ry] = room.origin
  const rx2 = rx + room.width, ry2 = ry + room.height
  // Check if point is within 'tol' of any wall
  return (
    (Math.abs(py - ry)  < tol && px >= rx - tol && px <= rx2 + tol) ||
    (Math.abs(py - ry2) < tol && px >= rx - tol && px <= rx2 + tol) ||
    (Math.abs(px - rx)  < tol && py >= ry - tol && py <= ry2 + tol) ||
    (Math.abs(px - rx2) < tol && py >= ry - tol && py <= ry2 + tol)
  )
}

export interface ValidationInput {
  rooms: Room[]
  doors: Door[]
  windows: Window[]
  siteContext?: {
    lot: { width: number; height: number }
    rules: { frontal: number; lateral: number; fundos: number }
  } | null
}

export function validateLayout(input: ValidationInput): Violation[] {
  const rooms = Array.isArray(input.rooms) ? input.rooms : []
  const doors = Array.isArray(input.doors) ? input.doors : []
  const windows = Array.isArray(input.windows) ? input.windows : []
  const siteContext = input.siteContext
  const violations: Violation[] = []

  // 1. Minimum areas
  for (const room of rooms) {
    const label = room.label ?? ''
    const minArea = getMinArea(label)
    const area = room.width * room.height
    if (minArea && area < minArea * 10000) {  // convert m² to cm²
      violations.push({
        severity: 'warning',
        code: 'MIN_AREA',
        message: `"${label}" tem ${(area / 10000).toFixed(1)}m² — mínimo recomendado ${(minArea / 100).toFixed(1)}m²`,
        element: label,
      })
    }
  }

  // 2. Room overlaps
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (overlap(rooms[i], rooms[j])) {
        violations.push({
          severity: 'error',
          code: 'OVERLAP',
          message: `"${rooms[i].label ?? i}" e "${rooms[j].label ?? j}" estão sobrepostos`,
        })
      }
    }
  }

  // 3. Rooms without doors
  for (const room of rooms) {
    const hasDoor = doors.some(d => pointNearWall(d.position, room))
    if (!hasDoor) {
      violations.push({
        severity: 'error',
        code: 'NO_DOOR',
        message: `"${room.label ?? 'ambiente'}" não tem porta — inacessível`,
        element: room.label,
      })
    }
  }

  // 4. Habitable rooms without windows
  for (const room of rooms) {
    const label = room.label ?? ''
    if (!isHabitable(label)) continue
    const hasWindow = windows.some(w => pointNearWall(w.position, room))
    if (!hasWindow) {
      violations.push({
        severity: 'warning',
        code: 'NO_WINDOW',
        message: `"${label}" não tem janela — exigência NBR 15220 (iluminação >= 1/8 do piso)`,
        element: label,
      })
    }
  }

  // 5. Door widths
  for (const door of doors) {
    if ((door.width ?? 90) < 80) {
      violations.push({
        severity: 'error',
        code: 'DOOR_TOO_NARROW',
        message: `Porta com ${door.width}cm — mínimo 80cm livre (NBR 9050)`,
      })
    }
  }

  // 6. Setback violations
  if (siteContext) {
    const { lot, rules } = siteContext
    for (const room of rooms) {
      const [rx, ry] = room.origin
      const rx2 = rx + room.width, ry2 = ry + room.height
      const label = room.label ?? 'ambiente'
      if (rx < rules.lateral) violations.push({ severity: 'error', code: 'SETBACK', message: `"${label}" viola afastamento lateral (${rules.lateral / 100}m)`, element: label })
      if (rx2 > lot.width - rules.lateral) violations.push({ severity: 'error', code: 'SETBACK', message: `"${label}" viola afastamento lateral direito`, element: label })
      if (ry < rules.frontal) violations.push({ severity: 'error', code: 'SETBACK', message: `"${label}" viola afastamento frontal (${rules.frontal / 100}m)`, element: label })
      if (ry2 > lot.height - rules.fundos) violations.push({ severity: 'error', code: 'SETBACK', message: `"${label}" viola afastamento de fundos`, element: label })
    }
  }

  return violations
}
