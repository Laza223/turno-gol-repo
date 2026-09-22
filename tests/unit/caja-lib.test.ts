/**
 * Helpers puros de la vista Caja (pages/caja.md). Contratos §8.3 (fecha humana,
 * ISO prohibido cara al usuario), §2.5 (signos), §4 (orden de arqueo) y la
 * heurística de cierre sin arqueo (§5).
 */
import { describe, expect, it } from 'vitest'
import {
  addDays,
  buildDelta,
  canteenStockBadge,
  CATEGORY_BADGE,
  categoryLabel,
  chipClass,
  countLowStock,
  formatTimeArt,
  mediumDateLabel,
  methodBreakdown,
  movementTitle,
  operatingDayLabel,
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

/**
 * El contador del punto de aviso tiene que decir lo MISMO que los badges de las
 * filas: si uno cuenta 2 y las filas muestran 3 en ámbar, nadie vuelve a
 * creerle al aviso. Por eso cada caso de acá es un caso de `canteenStockBadge`.
 */
describe('countLowStock', () => {
  const p = (stock: number | null, minStock: number | null, isActive = true) => ({
    stock,
    minStock,
    isActive,
  })

  it('cuenta lo que el badge marca "Quedan N" y "Agotado"', () => {
    expect(countLowStock([p(1, 5), p(5, 5), p(0, 5)])).toBe(3)
  })

  it('un agotado SIN mínimo cargado también cuenta: es el caso más urgente', () => {
    expect(countLowStock([p(0, null), p(-1, null)])).toBe(2)
  })

  it('no cuenta lo que el badge marca "Stock N" ni lo que no controla stock', () => {
    expect(countLowStock([p(6, 5), p(1, null), p(null, null), p(null, 5)])).toBe(0)
  })

  it('un producto pausado no pide reposición', () => {
    expect(countLowStock([p(0, 5, false), p(1, 5, false)])).toBe(0)
  })
})

describe('mediumDateLabel', () => {
  it('formatea "YYYY-MM-DD" al formato medio §8.3 sin ISO ni coma', () => {
    // 2026-07-02 cae jueves (verificado — no copiar el ejemplo ilustrativo del spec).
    expect(mediumDateLabel('2026-07-02')).toBe('jue 2 de julio')
    expect(mediumDateLabel('2026-01-01')).toBe('jue 1 de enero')
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

describe('operatingDayLabel', () => {
  it('sin corte nocturno el día ES el calendario: la coletilla no aparece', () => {
    // cutoffMins 0 es la inmensa mayoría de los complejos (closesNextDay=false).
    // Decir "desde las 00:00" ahí no informa nada y suma ruido.
    expect(operatingDayLabel('2026-07-02', 0)).toBe('jue 2 de julio')
  })

  it('con corte nocturno dice desde qué hora arranca el día de trabajo', () => {
    expect(operatingDayLabel('2026-07-02', 360)).toBe('jue 2 de julio · desde las 06:00')
    expect(operatingDayLabel('2026-07-02', 90)).toBe('jue 2 de julio · desde las 01:30')
  })

  it('un cutoff negativo no puede escribir una hora inventada', () => {
    // Defensivo: nightCutoffMins nunca devuelve negativo, pero un label es lo
    // último que debería inventar un horario si alguna vez lo hiciera.
    expect(operatingDayLabel('2026-07-02', -30)).toBe('jue 2 de julio')
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

  // migr. 050 — las 5 categorías de gasto nuevas que la UI SÍ ofrece
  // (operating_expense queda arriba como legacy display-only).
  it('traduce las 5 categorías de gasto nuevas (migr. 050)', () => {
    expect(categoryLabel('expense', 'merchandise')).toBe('Mercadería')
    expect(categoryLabel('expense', 'salaries')).toBe('Sueldos')
    expect(categoryLabel('expense', 'utilities')).toBe('Servicios')
    expect(categoryLabel('expense', 'maintenance')).toBe('Mantenimiento')
    expect(categoryLabel('expense', 'other_expense')).toBe('Otro gasto')
  })
})

describe('movementTitle', () => {
  it('reemplaza el UUID crudo de la seña por un título legible', () => {
    expect(movementTitle('Seña — turno 8f5b1c1e-1111-4a2b-9c3d-000000000000')).toBe(
      'Seña del turno',
    )
  })

  it('deja cualquier otra descripción tal cual', () => {
    expect(movementTitle('Sueldo cadete')).toBe('Sueldo cadete')
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

describe('chipClass', () => {
  it('activo = emerald AA; inactivo = tokens neutros', () => {
    expect(chipClass(true)).toContain('border-emerald-600')
    expect(chipClass(false)).toContain('border-border')
  })
})

describe('categoría tournament (migr. 066)', () => {
  it('tiene su propio label y no cae al fallback', () => {
    expect(categoryLabel('income', 'tournament')).toBe('Inscripción a torneo')
  })

  it('tiene chip propio: no comparte el de reserva ni el de cantina', () => {
    expect(CATEGORY_BADGE.tournament).toBeDefined()
    expect(CATEGORY_BADGE.tournament).not.toBe(CATEGORY_BADGE.booking)
    expect(CATEGORY_BADGE.tournament).not.toBe(CATEGORY_BADGE.product_sale)
    expect(CATEGORY_BADGE.tournament).not.toBe(CATEGORY_BADGE.fallback)
  })
})

describe('paleta por categoría', () => {
  const EGRESOS = [
    'operating_expense',
    'merchandise',
    'salaries',
    'utilities',
    'maintenance',
    'other_expense',
  ] as const

  it('los seis egresos comparten exactamente el mismo chip', () => {
    // El color codifica el SIGNO, no el rubro (migr. 050). Eran seis copias del
    // mismo string: cualquiera podía divergir sola y nadie se enteraba.
    const chips = new Set(EGRESOS.map((c) => CATEGORY_BADGE[c]))
    expect(chips.size).toBe(1)
  })

  it('cada chip trae su propio ring: los renderers no lo agregan', () => {
    for (const chip of Object.values(CATEGORY_BADGE)) {
      expect(chip).toContain('ring-1 ring-inset')
    }
  })
})
