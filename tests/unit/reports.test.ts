import { describe, expect, it } from 'vitest'
import {
  getMonthBounds,
  prevMonthStr,
  nextMonthStr,
  formatMonthLabel,
  calcAvailableMinutes,
  calcOccupancyPct,
  toCsv,
  aggregateByMethod,
  isReportEmpty,
} from '@/modules/reports/report.utils'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

const ALL_DAY_HOURS: OpeningHours = {
  mon: { open: '08:00', close: '00:00' },
  tue: { open: '08:00', close: '00:00' },
  wed: { open: '08:00', close: '00:00' },
  thu: { open: '08:00', close: '00:00' },
  fri: { open: '08:00', close: '00:00' },
  sat: { open: '08:00', close: '00:00' },
  sun: { open: '08:00', close: '00:00' },
}

const CLOSED_MONDAYS: OpeningHours = {
  ...ALL_DAY_HOURS,
  mon: { open: '08:00', close: '00:00', closed: true },
}

describe('getMonthBounds', () => {
  it('devuelve los días operativos del mes y el primero del siguiente', () => {
    const { fromDate, toDate } = getMonthBounds('2026-05')
    expect(fromDate).toBe('2026-05-01')
    expect(toDate).toBe('2026-06-01')
  })

  it('cruza el límite de año diciembre → enero', () => {
    const { fromDate, toDate } = getMonthBounds('2026-12')
    expect(fromDate).toBe('2026-12-01')
    expect(toDate).toBe('2027-01-01')
  })

  it('los instantes arrancan a medianoche ART, no UTC (cutoff 0)', () => {
    // ART es UTC-3: el mes arranca a las 03:00Z del día 1, no a las 00:00Z.
    // Con el cálculo viejo (medianoche UTC) las 3 horas previas —21:00 a 23:59
    // del último día del mes anterior— entraban al mes equivocado.
    const { fromUtc, toUtc } = getMonthBounds('2026-05')
    expect(fromUtc.toISOString()).toBe('2026-05-01T03:00:00.000Z')
    expect(toUtc.toISOString()).toBe('2026-06-01T03:00:00.000Z')
  })

  it('corre los instantes por el cutoff del complejo que cierra de madrugada', () => {
    // cutoff 120' (cierra 02:00): el día operativo arranca a las 02:00 ART.
    const { fromUtc, toUtc } = getMonthBounds('2026-05', 120)
    expect(fromUtc.toISOString()).toBe('2026-05-01T05:00:00.000Z')
    expect(toUtc.toISOString()).toBe('2026-06-01T05:00:00.000Z')
  })
})

describe('prevMonthStr', () => {
  it('returns previous month', () => {
    expect(prevMonthStr('2026-05')).toBe('2026-04')
  })

  it('wraps January to previous year December', () => {
    expect(prevMonthStr('2026-01')).toBe('2025-12')
  })
})

describe('nextMonthStr', () => {
  it('advances month', () => {
    expect(nextMonthStr('2026-05')).toBe('2026-06')
  })

  it('wraps December to next year January', () => {
    expect(nextMonthStr('2026-12')).toBe('2027-01')
  })
})

describe('formatMonthLabel', () => {
  it('returns a non-empty string containing the year', () => {
    const label = formatMonthLabel('2026-05')
    expect(label).toContain('2026')
    expect(label.length).toBeGreaterThan(4)
  })
})

describe('calcAvailableMinutes', () => {
  // 08:00 a 00:00 = 960 minutos por día
  it('devuelve 960 × 7 para una semana completa con 1 cancha', () => {
    // 2026-05-04 (lun) a 2026-05-11 (lun) = 7 días
    expect(calcAvailableMinutes('2026-05-04', '2026-05-11', ALL_DAY_HOURS, 1)).toBe(7 * 960)
  })

  it('saltea los días con closed: true', () => {
    // 1 lunes salteado → 6 días abiertos
    expect(calcAvailableMinutes('2026-05-04', '2026-05-11', CLOSED_MONDAYS, 1)).toBe(6 * 960)
  })

  it('escala linealmente con courtCount', () => {
    expect(calcAvailableMinutes('2026-05-04', '2026-05-05', ALL_DAY_HOURS, 3)).toBe(960 * 3)
  })

  it('devuelve 0 cuando courtCount es 0', () => {
    expect(calcAvailableMinutes('2026-05-04', '2026-05-05', ALL_DAY_HOURS, 0)).toBe(0)
  })

  it('devuelve 0 con from y to iguales', () => {
    expect(calcAvailableMinutes('2026-05-04', '2026-05-04', ALL_DAY_HOURS, 2)).toBe(0)
  })

  it('excluye los días de closedDates', () => {
    // 2026-05-04 (lun) a 2026-05-06 (mié) = 2 días; se cierra el 05 (mar)
    expect(calcAvailableMinutes('2026-05-04', '2026-05-06', ALL_DAY_HOURS, 1, ['2026-05-05'])).toBe(
      960,
    )
  })

  it('REGRESIÓN: un complejo que cierra 02:00 no da 0 minutos disponibles', () => {
    // El cálculo viejo hacía `Math.max(0, 120 - 480)` = 0 para un día
    // 08:00→02:00, así que el denominador de ocupación quedaba en cero y
    // `calcOccupancyPct` devolvía 0% SIEMPRE: un complejo lleno se reportaba
    // vacío. Con el flag, 08:00→02:00 son 18 h = 1080 minutos.
    const madrugada: OpeningHours = {
      mon: { open: '08:00', close: '02:00' },
      tue: { open: '08:00', close: '02:00' },
      wed: { open: '08:00', close: '02:00' },
      thu: { open: '08:00', close: '02:00' },
      fri: { open: '08:00', close: '02:00' },
      sat: { open: '08:00', close: '02:00' },
      sun: { open: '08:00', close: '02:00' },
    }
    expect(calcAvailableMinutes('2026-05-04', '2026-05-05', madrugada, 1, null, true)).toBe(1080)
    // Sin el flag el cierre de madrugada es un rango inválido: 0, y está bien
    // que lo sea — es el mismo criterio que usan los generadores de slots.
    expect(calcAvailableMinutes('2026-05-04', '2026-05-05', madrugada, 1, null, false)).toBe(0)
  })
})

describe('calcOccupancyPct', () => {
  it('returns 0 when availableMinutes is 0', () => {
    expect(calcOccupancyPct(500, 0)).toBe(0)
  })

  it('returns 100 when fully booked', () => {
    expect(calcOccupancyPct(960, 960)).toBe(100)
  })

  it('returns 50 for half occupancy', () => {
    expect(calcOccupancyPct(480, 960)).toBe(50)
  })

  it('rounds to 1 decimal place', () => {
    expect(calcOccupancyPct(1, 3)).toBe(33.3)
  })
})

describe('toCsv', () => {
  it('returns empty string for empty array', () => {
    expect(toCsv([])).toBe('')
  })

  it('writes header row and data row', () => {
    const csv = toCsv([{ fecha: '2026-05-01', monto: 1000 }])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('fecha,monto')
    expect(lines[1]).toBe('2026-05-01,1000')
  })

  it('wraps values containing commas in double quotes', () => {
    const csv = toCsv([{ desc: 'hola, mundo' }])
    expect(csv).toContain('"hola, mundo"')
  })

  it('escapes embedded double quotes as double-double-quotes', () => {
    const csv = toCsv([{ desc: 'say "hi"' }])
    expect(csv).toContain('"say ""hi"""')
  })

  it('handles null and undefined values as empty strings', () => {
    const csv = toCsv([{ a: null, b: undefined }])
    const dataLine = csv.split('\r\n')[1]
    expect(dataLine).toBe(',')
  })
})

describe('aggregateByMethod (#43)', () => {
  it('suma solo income por método e ignora los adjustment', () => {
    const result = aggregateByMethod([
      { type: 'income', method: 'cash', total: 1000 },
      { type: 'income', method: 'transfer', total: 500 },
      { type: 'adjustment', method: 'cash', total: 9999 },
    ])
    const byMethod = Object.fromEntries(result.map((m) => [m.method, m.total]))
    expect(byMethod).toEqual({ cash: 1000, transfer: 500 })
    // el adjustment NO infló el total de cash
    expect(byMethod.cash).toBe(1000)
  })

  it('devuelve vacío cuando solo hay adjustments', () => {
    expect(aggregateByMethod([{ type: 'adjustment', method: 'cash', total: 5000 }])).toEqual([])
  })

  it('normaliza totales string (BIGINT de Postgres) y descarta <= 0', () => {
    const result = aggregateByMethod([
      { type: 'income', method: 'mercadopago', total: '2500' },
      { type: 'income', method: 'other', total: 0 },
    ])
    expect(result).toEqual([{ method: 'mercadopago', total: 2500 }])
  })
})

describe('isReportEmpty (#42)', () => {
  it('es true solo sin ingresos, ni ajustes, ni reservas', () => {
    expect(isReportEmpty({ income: 0, adjustment: 0, bookingCount: 0 })).toBe(true)
  })

  it('es false si hay solo ajustes (caso del bug #42)', () => {
    expect(isReportEmpty({ income: 0, adjustment: 15000, bookingCount: 0 })).toBe(false)
  })

  it('es false si hay ingresos o reservas', () => {
    expect(isReportEmpty({ income: 1000, adjustment: 0, bookingCount: 0 })).toBe(false)
    expect(isReportEmpty({ income: 0, adjustment: 0, bookingCount: 3 })).toBe(false)
  })
})
