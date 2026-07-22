/**
 * Helpers puros de la vista Caja (pages/caja.md). Contratos §8.3 (fecha humana,
 * ISO prohibido cara al usuario), §2.5 (signos), §4 (orden de arqueo) y la
 * heurística de cierre sin arqueo (§5).
 */
import { describe, expect, it } from 'vitest'
import {
  addDays,
  buildDelta,
  cajaDateLabel,
  canteenStockBadge,
  categoryLabel,
  chipClass,
  closeView,
  formatTimeArt,
  mediumDateLabel,
  methodBreakdown,
  signedArs,
} from '@/app/(admin)/caja/caja-lib'

// Intl es-AR usa espacio no separable tras "$"; normalizar para comparar.
const flat = (s: string) => s.replace(/ /g, ' ')

describe('canteenStockBadge', () => {
  it('devuelve null cuando el producto no controla stock (null/undefined)', () => {
    expect(canteenStockBadge(undefined)).toBeNull()
    expect(canteenStockBadge(null)).toBeNull()
    expect(canteenStockBadge(null, 5)).toBeNull()
  })

  it('marca "Agotado" (out) en 0 o negativo, con o sin minStock cargado', () => {
    expect(canteenStockBadge(0)).toEqual({ label: 'Agotado', tone: 'out' })
    expect(canteenStockBadge(0, 5)).toEqual({ label: 'Agotado', tone: 'out' })
    expect(canteenStockBadge(-2)).toEqual({ label: 'Agotado', tone: 'out' })
  })

  it('sin minStock cargado (null) nunca hay alerta "low" — solo el corte en 0', () => {
    expect(canteenStockBadge(1, null)).toEqual({ label: 'Stock 1', tone: 'ok' })
    expect(canteenStockBadge(1)).toEqual({ label: 'Stock 1', tone: 'ok' })
  })

  it('con minStock explícito: stock <= minStock marca "Quedan N" (low)', () => {
    expect(canteenStockBadge(1, 5)).toEqual({ label: 'Quedan 1', tone: 'low' })
    expect(canteenStockBadge(5, 5)).toEqual({ label: 'Quedan 5', tone: 'low' })
  })

  it('stock por encima de minStock (o sin minStock) marca "Stock N" (ok)', () => {
    expect(canteenStockBadge(6, 5)).toEqual({ label: 'Stock 6', tone: 'ok' })
    expect(canteenStockBadge(20)).toEqual({ label: 'Stock 20', tone: 'ok' })
  })
})

describe('mediumDateLabel / cajaDateLabel', () => {
  it('formatea "YYYY-MM-DD" al formato medio §8.3 sin ISO ni coma', () => {
    // 2026-07-02 cae jueves (verificado — no copiar el ejemplo ilustrativo del spec).
    expect(mediumDateLabel('2026-07-02')).toBe('jue 2 de julio')
    expect(mediumDateLabel('2026-01-01')).toBe('jue 1 de enero')
  })

  it('prefija Hoy/Ayer cuando corresponde (relativo §8.3)', () => {
    expect(cajaDateLabel('2026-07-02', '2026-07-02')).toBe('Hoy — jue 2 de julio')
    expect(cajaDateLabel('2026-07-01', '2026-07-02')).toBe('Ayer — mié 1 de julio')
    expect(cajaDateLabel('2026-06-25', '2026-07-02')).toBe('jue 25 de junio')
  })

  it('addDays cruza meses y años sin depender de la TZ del host', () => {
    expect(addDays('2026-07-01', -1)).toBe('2026-06-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('formatTimeArt: 24h SIEMPRE §8.3, aun en ICUs que resuelven es-AR como 12h', () => {
    expect(formatTimeArt(new Date('2026-06-11T02:40:00Z'))).toBe('23:40') // 23:40 ART del día 10
    expect(formatTimeArt(new Date('2026-06-11T03:05:00Z'))).toBe('00:05') // medianoche → 00, no 24
  })
})

describe('methodBreakdown', () => {
  it('ordena en orden de arqueo (efectivo primero) y omite métodos sin movimientos', () => {
    const rows = methodBreakdown({ mercadopago: 500, cash: 1000 })
    expect(rows.map((r) => r.key)).toEqual(['cash', 'mercadopago'])
    expect(rows[0]).toEqual({ key: 'cash', label: 'Efectivo', total: 1000 })
  })

  it('sin movimientos devuelve vacío (la sección no se renderiza)', () => {
    expect(methodBreakdown({})).toEqual([])
  })
})

describe('categoryLabel', () => {
  it('traduce todos los ENUMs', () => {
    expect(categoryLabel('income', 'booking')).toBe('Reserva')
    expect(categoryLabel('income', 'product_sale')).toBe('Cantina/Bar')
    expect(categoryLabel('expense', 'operating_expense')).toBe('Gasto operativo')
    expect(categoryLabel('adjustment', 'no_show_correction')).toBe('Corrección por ausencia')
  })

  it('desambigua "other" según el tipo', () => {
    expect(categoryLabel('income', 'other')).toBe('Otro ingreso')
    expect(categoryLabel('adjustment', 'other')).toBe('Ajuste')
  })
})

describe('signedArs / buildDelta', () => {
  it('signo + / − (U+2212) y sin decimales (comparativa, no asiento)', () => {
    expect(flat(signedArs(150000))).toBe('+$ 1.500')
    expect(flat(signedArs(-80000))).toBe('−$ 800')
    expect(flat(signedArs(0))).toBe('$ 0')
  })

  it('delta positivo: glifo up + tone positive; con invert (egresos) el mismo glifo es negativo', () => {
    const ingresos = buildDelta(200000, 150000, 'vs ayer')
    expect(ingresos).toMatchObject({ direction: 'up', tone: 'positive' })
    expect(flat(ingresos!.label)).toBe('+$ 500 vs ayer')

    const egresos = buildDelta(200000, 150000, 'vs ayer', { invert: true })
    expect(egresos).toMatchObject({ direction: 'up', tone: 'negative' })
  })

  it('sin nada que comparar (día y referencia en 0) se omite; empate ≠ 0 es neutral', () => {
    expect(buildDelta(0, 0, 'vs ayer')).toBeNull()
    expect(buildDelta(5000, 5000, 'vs ayer')).toMatchObject({
      direction: 'neutral',
      tone: 'neutral',
    })
  })
})

describe('closeView', () => {
  it('declaredCash=0 con diff=balance → sin arqueo declarado (no alarmar con dif falsa)', () => {
    expect(closeView({ declaredCash: 0, diffAmount: 400000, balance: 400000 })).toEqual({
      hasCashCount: false,
      hasDiff: false,
    })
  })

  it('arqueo que cuadra y arqueo con diferencia', () => {
    expect(closeView({ declaredCash: 400000, diffAmount: 0, balance: 400000 })).toEqual({
      hasCashCount: true,
      hasDiff: false,
    })
    expect(closeView({ declaredCash: 300000, diffAmount: 100000, balance: 400000 })).toEqual({
      hasCashCount: true,
      hasDiff: true,
    })
  })
})

describe('chipClass', () => {
  it('activo = emerald AA; inactivo = tokens neutros', () => {
    expect(chipClass(true)).toContain('border-emerald-600')
    expect(chipClass(false)).toContain('border-border')
  })
})
