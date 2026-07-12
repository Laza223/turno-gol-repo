import type { CSSProperties } from 'react'
import type { DayKey } from '@/modules/courts/pricing-grid'

export const cellKey = (day: DayKey, hour: number) => `${day}:${hour}`

export function parseCellKey(key: string): { day: DayKey; hour: number } {
  const [day, hour] = key.split(':')
  return { day: day as DayKey, hour: Number(hour) }
}

// Heat map: barato → caro, interpolado en RGB. El inline style NO responde a
// `.dark`, así que se elige la rampa por tema. Light: emerald-50 → emerald-700.
// Dark: emerald-950 muy oscuro → emerald-500 brillante (sobre card oscuro).
const HEAT_LO = [236, 253, 245] // #ecfdf5
const HEAT_HI = [4, 120, 87] //   #047857
const HEAT_LO_DARK = [6, 33, 25] // ~emerald-950
const HEAT_HI_DARK = [16, 185, 129] // #10b981 emerald-500

/**
 * Candidatos de color de texto. Se elige el que MIDA más contraste contra el
 * fondo real de la celda, no por un umbral fijo sobre `t`.
 *
 * Por qué importa: antes el color se elegía con `t > 0.52 ? blanco : emerald-900`,
 * y eso dejaba una ZONA MUERTA. En la rampa clara, emerald-900 (#064e3b) mantiene
 * AA solo hasta t≈0.48 y el blanco recién lo alcanza en t≈0.89: entre medio (el 41%
 * del rango de precios) NINGÚN color de texto llegaba a 4.5:1 — y el umbral 0.52
 * caía justo adentro. axe lo cazó con 182 violaciones: blanco sobre rgb(81,164,140)
 * = 2.98:1. La rampa oscura tenía el mismo agujero entre 0.47 y 0.83.
 *
 * El par blanco / slate-950 es el único de los evaluados que cubre las DOS rampas
 * enteras sin agujeros (peor caso 4.51:1 y 4.52:1, justo por encima de AA).
 * Elegir por contraste medido, además, hace que esto se auto-corrija si alguien
 * cambia los extremos de la rampa — y `pricing-grid-contrast.test.ts` lo verifica
 * barriendo t de 0 a 1.
 */
const TEXT_LIGHT = '#ffffff'
const TEXT_DARK = '#020617' // slate-950 — el mismo --background del tema oscuro

/** Luminancia relativa WCAG 2.x. */
function relativeLuminance([r, g, b]: number[]): number {
  const channel = (v: number) => {
    const c = v! / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!)
}

/** Ratio de contraste WCAG entre dos colores RGB. */
export function contrastRatio(a: number[], b: number[]): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const WHITE_RGB = [255, 255, 255]
const SLATE_950_RGB = [2, 6, 23]

/** Color de la celda del heat map para un precio dado, y el texto que mejor contrasta. */
export function heatStyle(price: number, min: number, max: number, isDark: boolean): CSSProperties {
  const t = max > min ? (price - min) / (max - min) : 0.45
  const lo = isDark ? HEAT_LO_DARK : HEAT_LO
  const hi = isDark ? HEAT_HI_DARK : HEAT_HI
  const bg = [0, 1, 2].map((i) => Math.round(lo[i]! + (hi[i]! - lo[i]!) * t))

  const useWhite = contrastRatio(WHITE_RGB, bg) >= contrastRatio(SLATE_950_RGB, bg)

  return {
    backgroundColor: `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`,
    color: useWhite ? TEXT_LIGHT : TEXT_DARK,
  }
}
