import { describe, expect, it } from 'vitest'
import { toGridBooking } from '@/app/(admin)/reservas/[id]/to-grid-booking'
import type { ReservaDetail } from '@/app/(admin)/reservas/queries'

/**
 * `toGridBooking` es el único puente entre `getBookingDetail` (SQL crudo de
 * `/reservas/[id]`) y el `GridBooking` que consumen `HoyChargeSection` +
 * `useSlotCharges` (el mismo control de cobro de Hoy y la Grilla). Lo que
 * prueba este archivo es la aritmética de `pending`/`totalPaid` (delegada a
 * `summarizeBookingCharges`, no reinventada acá) y los instantes físicos —
 * de ahí sale `chargeMode` (adelanto / cobrar-y-dar-por-jugado / saldo).
 */
function detail(overrides: Partial<ReservaDetail> = {}): ReservaDetail {
  return {
    id: 'b1',
    date: '2026-09-16',
    timeStart: '20:00',
    timeEnd: '21:00',
    status: 'confirmed',
    type: 'spontaneous',
    courtName: 'Cancha 1',
    playerName: null,
    guestName: 'Juan Pérez',
    priceSnapshot: 6_000_000,
    depositAmount: 0,
    depositStatus: 'not_required',
    paymentMethod: null,
    notesPlayer: null,
    notesInternal: null,
    playerPhone: null,
    guestPhone: null,
    canceledReason: null,
    cancellationPolicyHours: 24,
    abonadoId: null,
    startsAt: '2026-09-16T23:00:00.000Z',
    endsAt: '2026-09-17T00:00:00.000Z',
    updatedAt: null,
    ...overrides,
  }
}

describe('toGridBooking', () => {
  it('con seña pagada: la cuenta la deposit_amount en totalPaid y no en charges', () => {
    const grid = toGridBooking(
      detail({ depositAmount: 1_800_000, depositStatus: 'paid', priceSnapshot: 6_000_000 }),
      0,
    )
    expect(grid.totalPaid).toBe(1_800_000)
    expect(grid.pending).toBe(4_200_000)
    expect(grid.depositAmount).toBe(1_800_000)
    expect(grid.depositStatus).toBe('paid')
  })

  it('con cobros de mostrador previos: se suman a lo pagado y bajan el pendiente', () => {
    const grid = toGridBooking(
      detail({ depositAmount: 1_800_000, depositStatus: 'paid', priceSnapshot: 6_000_000 }),
      2_000_000, // chargesTotal
    )
    expect(grid.totalPaid).toBe(3_800_000)
    expect(grid.pending).toBe(2_200_000)
  })

  it('turno completed: el status pasa igual, `chargeMode` es cosa del consumidor', () => {
    const grid = toGridBooking(detail({ status: 'completed' }), 0)
    expect(grid.status).toBe('completed')
    expect(grid.pending).toBe(6_000_000)
  })

  it('sin starts_at/ends_at: los instantes físicos quedan null, no inventa una hora', () => {
    const grid = toGridBooking(detail({ startsAt: null, endsAt: null }), 0)
    expect(grid.startsAtMs).toBeNull()
    expect(grid.endsAtMs).toBeNull()
  })

  it('con starts_at/ends_at: convierte a milisegundos', () => {
    const grid = toGridBooking(detail(), 0)
    expect(grid.startsAtMs).toBe(Date.parse('2026-09-16T23:00:00.000Z'))
    expect(grid.endsAtMs).toBe(Date.parse('2026-09-17T00:00:00.000Z'))
  })
})
