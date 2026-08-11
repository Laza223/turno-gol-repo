import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  heatStyle,
} from '@/app/(admin)/settings/canchas/components/pricing-grid/cell-utils'

/**
 * El heat map de la grilla de precios pinta el fondo de cada celda con un color
 * interpolado (inline style) y le pone texto encima. Es fácil que la combinación
 * caiga por debajo de WCAG AA sin que nadie lo note: el gradiente es continuo, así
 * que el problema aparece solo en una franja de precios intermedios.
 *
 * Pasó exactamente eso: el color de texto se elegía con un umbral fijo
 * (`t > 0.52 ? blanco : emerald-900`) que dejaba una ZONA MUERTA — entre t≈0.48 y
 * t≈0.89 de la rampa clara ningún color llegaba a 4.5:1, y el umbral caía adentro.
 * axe lo reportó como blanco sobre rgb(81,164,140) = 2.98:1, 182 veces.
 *
 * Este test barre la rampa entera en los dos temas. No verifica "el color que
 * elegimos hoy": verifica el CONTRATO — que para cualquier precio, el texto de la
 * celda sea legible. Si alguien mueve los extremos de la rampa y reabre el agujero,
 * esto se pone rojo.
 */
const AA_NORMAL_TEXT = 4.5

function parseRgb(css: string): number[] {
  const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (!m) throw new Error(`backgroundColor inesperado: ${css}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function parseHex(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

describe('heatStyle — contraste de la grilla de precios (WCAG AA)', () => {
  for (const [themeLabel, isDark] of [
    ['light', false],
    ['dark', true],
  ] as const) {
    it(`cada precio de la rampa ${themeLabel} da texto legible (>= ${AA_NORMAL_TEXT}:1)`, () => {
      const MIN = 10_000_00 // centavos
      const MAX = 40_000_00
      const failures: string[] = []

      // 201 muestras: suficiente para atravesar cualquier franja mala del gradiente.
      for (let i = 0; i <= 200; i++) {
        const price = MIN + ((MAX - MIN) * i) / 200
        const style = heatStyle(price, MIN, MAX, isDark)
        const bg = parseRgb(String(style.backgroundColor))
        const fg = parseHex(String(style.color))
        const ratio = contrastRatio(fg, bg)
        if (ratio < AA_NORMAL_TEXT) {
          failures.push(
            `t=${(i / 200).toFixed(3)} bg=rgb(${bg.join(',')}) fg=${style.color} ratio=${ratio.toFixed(2)}`,
          )
        }
      }

      expect(failures, `celdas por debajo de AA:\n${failures.slice(0, 5).join('\n')}`).toEqual([])
    })
  }

  it('sin rango de precios (min === max) sigue siendo legible', () => {
    for (const isDark of [false, true]) {
      const style = heatStyle(25_000_00, 25_000_00, 25_000_00, isDark)
      const ratio = contrastRatio(
        parseHex(String(style.color)),
        parseRgb(String(style.backgroundColor)),
      )
      expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    }
  })

  it('el extremo barato y el caro usan colores de texto distintos (el heat map se sigue leyendo)', () => {
    const barato = heatStyle(0, 0, 100, false)
    const caro = heatStyle(100, 0, 100, false)
    expect(barato.color).not.toBe(caro.color)
  })
})
