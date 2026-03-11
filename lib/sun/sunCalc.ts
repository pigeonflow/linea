import SunCalc from 'suncalc'

export interface SunPosition {
  azimuth: number   // degrees from north, clockwise (0=N, 90=E, 180=S, 270=W)
  altitude: number  // degrees above horizon (negative = below)
}

export interface SunPathPoint {
  time: Date
  azimuth: number
  altitude: number
}

/** Convert SunCalc azimuth (radians from south, clockwise) to degrees from north */
function toNorthDeg(azRad: number): number {
  return ((azRad * 180 / Math.PI) + 180) % 360
}

export function getSunPosition(lat: number, lng: number, date: Date): SunPosition {
  const pos = SunCalc.getPosition(date, lat, lng)
  return {
    azimuth: toNorthDeg(pos.azimuth),
    altitude: pos.altitude * 180 / Math.PI,
  }
}

/** Get sun path for a full day, sampled every 30 minutes */
export function getSunPath(lat: number, lng: number, date: Date): SunPathPoint[] {
  const points: SunPathPoint[] = []
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  for (let h = 0; h < 24; h += 0.5) {
    const t = new Date(d.getTime() + h * 3600 * 1000)
    const pos = SunCalc.getPosition(t, lat, lng)
    const altitude = pos.altitude * 180 / Math.PI
    if (altitude > -5) {  // only above-horizon points
      points.push({ time: t, azimuth: toNorthDeg(pos.azimuth), altitude })
    }
  }
  return points
}

export function getSunTimes(lat: number, lng: number, date: Date) {
  return SunCalc.getTimes(date, lat, lng)
}

/** Key dates for analysis */
export const KEY_DATES = {
  summerSolstice:  new Date(new Date().getFullYear(), 11, 21), // Dec 21 — summer in BR
  winterSolstice:  new Date(new Date().getFullYear(),  5, 21), // Jun 21 — winter in BR
  equinox:         new Date(new Date().getFullYear(),  2, 20), // Mar 20
}

/** Default location: São Paulo */
export const DEFAULT_LOCATION = { lat: -23.5505, lng: -46.6333, label: 'São Paulo, SP' }
