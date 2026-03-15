import { Room } from './validateLayout'

export type Relation =
  | 'adjacent_east'
  | 'adjacent_west'
  | 'adjacent_north'
  | 'adjacent_south'
  | 'center_of'

export interface ComputePositionInput {
  referenceRoom: Room
  relation: Relation
  elementWidth?: number
  elementHeight?: number
  gap?: number  // cm between rooms (0 = shared wall)
}

export interface ComputedPosition {
  origin: [number, number]
  suggestedWidth?: number
  suggestedHeight?: number
  wallPosition?: [number, number]  // for door/window placement on shared wall
  wallRotation?: number
}

export function computePosition(input: ComputePositionInput): ComputedPosition {
  const { referenceRoom: r, relation, elementWidth = 300, elementHeight = 300, gap = 0 } = input

  if (!r?.origin || !Array.isArray(r.origin)) {
    return { origin: [0, 0] }  // safe fallback — server guard will reject if out of bounds
  }

  const [rx, ry] = r.origin
  const t = r.wallThickness ?? 20

  switch (relation) {
    case 'adjacent_east':
      return {
        origin: [rx + r.width, ry],
        wallPosition: [rx + r.width, ry + Math.min(r.height, elementHeight) / 2],
        wallRotation: 90,
      }
    case 'adjacent_west':
      return {
        origin: [rx - elementWidth, ry],
        wallPosition: [rx, ry + Math.min(r.height, elementHeight) / 2],
        wallRotation: 90,
      }
    case 'adjacent_south':
      return {
        origin: [rx, ry + r.height],
        wallPosition: [rx + Math.min(r.width, elementWidth) / 2, ry + r.height],
        wallRotation: 0,
      }
    case 'adjacent_north':
      return {
        origin: [rx, ry - elementHeight],
        wallPosition: [rx + Math.min(r.width, elementWidth) / 2, ry],
        wallRotation: 0,
      }
    case 'center_of':
      return {
        origin: [
          rx + (r.width - elementWidth) / 2,
          ry + (r.height - elementHeight) / 2,
        ],
      }
  }
}

/** Given a room and a wall side, return the ideal center position for a door/window */
export function wallCenter(room: Room, wall: 'north' | 'south' | 'east' | 'west'): { position: [number, number]; rotation: number } {
  if (!room?.origin || !Array.isArray(room.origin)) {
    return { position: [0, 0], rotation: 0 }
  }
  const [rx, ry] = room.origin
  switch (wall) {
    case 'north': return { position: [rx + room.width / 2, ry], rotation: 0 }
    case 'south': return { position: [rx + room.width / 2, ry + room.height], rotation: 0 }
    case 'west':  return { position: [rx, ry + room.height / 2], rotation: 90 }
    case 'east':  return { position: [rx + room.width, ry + room.height / 2], rotation: 90 }
  }
}
