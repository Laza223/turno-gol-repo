import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/app/(admin)/canchas/components/pricing-grid/cell-utils'

/**
 * `.hero-accent-text` (claro) es texto grande con degradé: WCAG 1.4.3 pide 3:1 en CADA
 * parada, no en el promedio. Se mide contra el peor fondo de la banda (#ecfdf5, el extremo
 * esmeralda de `.player-hero-band`).
 */
const css = readFileSync('src/app/globals.css', 'utf8')
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const BAND_BG = hex('#ecfdf5')

describe('hero-accent-text claro — contraste', () => {
  it('todas las paradas del degradé llegan a 3:1 sobre la banda', () => {
    const rule = css.match(/\n\.hero-accent-text \{[^}]*linear-gradient\(([^)]*)\)/)
    expect(rule).not.toBeNull()
    const stops = rule![1]!.match(/#[0-9a-f]{6}/gi) ?? []
    expect(stops.length).toBeGreaterThanOrEqual(2)
    for (const s of stops) expect(contrastRatio(hex(s), BAND_BG)).toBeGreaterThanOrEqual(3)
  })
})
