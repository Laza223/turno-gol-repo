import type { CSSProperties } from 'react'
import type { DayKey } from '@/modules/courts/pricing-grid'

export const cellKey = (day: DayKey, hour: number) => `${day}:${hour}`

export function parseCellKey(key: string): { day: DayKey; hour: number } {
  const [day, hour] = key.split(':')
  return { day: day as DayKey, hour: Number(hour) }
}

// Heat map: barato → caro, interpolado en RGB. Inline style NO responde a
// `.dark`, así que se elige la rampa por tema. Light: emerald-50 → emerald-700.
// Dark: emerald-950 muy oscuro → emerald-500 brillante (sobre card oscuro).
const HEAT_LO = [236, 253, 245] // #ecfdf5
const HEAT_HI = [4, 120, 87] //   #047857
const HEAT_LO_DARK = [6, 33, 25] // ~emerald-950
const HEAT_HI_DARK = [16, 185, 129] // #10b981 emerald-500

export function heatStyle(price: number, min: number, max: number, isDark: boolean): CSSProperties {
  const t = max > min ? (price - min) / (max - min) : 0.45
  const lo = isDark ? HEAT_LO_DARK : HEAT_LO
  const hi = isDark ? HEAT_HI_DARK : HEAT_HI
  const mix = (i: number) => Math.round(lo[i]! + (hi[i]! - lo[i]!) * t)
  return {
    backgroundColor: `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`,
    color: isDark ? (t > 0.52 ? '#022c22' : '#6ee7b7') : t > 0.52 ? '#ffffff' : '#064e3b',
  }
}
