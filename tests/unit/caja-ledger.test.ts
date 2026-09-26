/**
 * Libro de la noche de Caja › Cuentas: qué dice cada movimiento y cómo se
 * agrupa por hora (`src/app/(admin)/caja/cuentas/ledger.ts`).
 */
import { describe, expect, it } from 'vitest'
import type { CashFlowListRow } from '@/modules/cashflow/cashflow.types'
import { groupByHour, toLedgerRow, type LedgerRow } from '@/app/(admin)/caja/cuentas/ledger'

/** 21:06 en Argentina (UTC-3). */
const AT = new Date('2026-09-25T00:06:00.000Z')

function cf(over: Partial<CashFlowListRow>): CashFlowListRow {
  return {
    id: 'cf-1',
    tenantId: 't-1',
    type: 'income',
    category: 'booking',
    amount: 4_200_000,
    method: 'cash',
    description: 'Cobro de turno',
    bookingId: 'b-1',
    tournamentTeamId: null,
    bookingTeam: null,
    registeredBy: 's-1',
    occurredAt: AT,
    createdAt: AT,
    counterpartName: 'Franco Díaz',
    ...over,
  }
}

describe('toLedgerRow', () => {
  it('un cobro de turno se lee por quién pagó y su equipo, con la hora argentina', () => {
    expect(toLedgerRow(cf({ bookingTeam: 2 }))).toEqual({
      id: 'cf-1',
      time: '21:06',
      kind: 'turno',
      text: 'Franco Díaz',
      detail: 'Equipo 2',
      method: 'cash',
      cents: 4_200_000,
      expense: false,
    })
  })

  it('nunca muestra "deuda": el cobro de un turno ya terminado dice quién pagó', () => {
    const row = toLedgerRow(cf({ description: 'Cobro de deuda atrasada (2/2)' }))
    expect(row.text).toBe('Franco Díaz')
    expect(JSON.stringify(row)).not.toMatch(/deuda/i)
  })

  it('sin nombre visible, el turno dice "Turno" y no la descripción guardada', () => {
    const row = toLedgerRow(cf({ description: 'Cobro de deuda atrasada', counterpartName: null }))
    expect(row.text).toBe('Turno')
  })

  it('la seña online se marca como seña', () => {
    const row = toLedgerRow(cf({ description: 'Seña — turno b-1', method: 'mercadopago' }))
    expect(row).toMatchObject({ kind: 'turno', text: 'Franco Díaz', detail: 'Seña' })
  })

  it('la venta de cantina pierde el "Cantina: " del ticket', () => {
    const row = toLedgerRow(
      cf({
        category: 'product_sale',
        description: 'Cantina: IMPERIAL x2, EMPANADA',
        bookingId: null,
        counterpartName: null,
      }),
    )
    expect(row).toMatchObject({ kind: 'cantina', text: 'IMPERIAL x2, EMPANADA', detail: null })
  })

  it('el fiado cobrado conserva su texto con el nombre', () => {
    const row = toLedgerRow(
      cf({ category: 'product_sale', description: 'Fiado cobrado — Cachi', counterpartName: null }),
    )
    expect(row).toMatchObject({ kind: 'fiado', text: 'Fiado cobrado — Cachi' })
  })

  it('un gasto sale en negativo y con su rubro al lado', () => {
    const row = toLedgerRow(
      cf({
        type: 'expense',
        category: 'merchandise',
        description: 'Cajón de gaseosas',
        bookingId: null,
        counterpartName: null,
      }),
    )
    expect(row).toMatchObject({
      kind: 'gasto',
      text: 'Cajón de gaseosas',
      detail: 'Mercadería',
      expense: true,
    })
  })

  it('un ajuste es un ingreso "otro" con su rubro', () => {
    const row = toLedgerRow(
      cf({
        type: 'adjustment',
        category: 'other',
        description: 'Vuelto mal dado',
        bookingId: null,
      }),
    )
    expect(row).toMatchObject({ kind: 'otro', detail: 'Ajuste', expense: false })
  })
})

describe('groupByHour', () => {
  const row = (id: string, time: string, cents: number, expense = false): LedgerRow => ({
    id,
    time,
    kind: expense ? 'gasto' : 'cantina',
    text: id,
    detail: null,
    method: 'cash',
    cents,
    expense,
  })

  it('junta las filas consecutivas de la misma hora y resta lo que salió', () => {
    const groups = groupByHour([
      row('a', '21:40', 700_000),
      row('b', '21:05', 250_000),
      row('c', '21:01', 100_000, true),
      row('d', '20:55', 300_000),
    ])
    expect(groups.map((g) => [g.hour, g.rows.map((r) => r.id), g.netCents])).toEqual([
      ['21', ['a', 'b', 'c'], 850_000],
      ['20', ['d'], 300_000],
    ])
  })

  it('lo de pasada la medianoche queda arriba, en el orden en que llega', () => {
    const groups = groupByHour([row('a', '00:10', 1), row('b', '23:50', 1)])
    expect(groups.map((g) => g.hour)).toEqual(['00', '23'])
  })

  it('sin filas, sin grupos', () => {
    expect(groupByHour([])).toEqual([])
  })
})
