import { describe, expect, it, vi } from 'vitest'
import type { SlotPanelActions } from '@/components/booking/slot-panel/actions'
import { slotGates } from '@/components/booking/slot-panel/slot-gates'
import type { GridBooking } from '@/lib/booking/grid-cells'

const actions = {
  writeOffBookingAction: vi.fn(),
  undoWriteOffAction: vi.fn(),
} as unknown as SlotPanelActions

const booking = (o: Partial<GridBooking> = {}): GridBooking =>
  ({
    id: 'b1',
    status: 'completed',
    type: 'spontaneous',
    timeStart: '20:00',
    timeEnd: '21:00',
    priceSnapshot: 6_000_000,
    pending: 2_500_000,
    ...o,
  }) as GridBooking

function canWriteOff(b: GridBooking, hasEnded: boolean, a: SlotPanelActions | undefined): boolean {
  return slotGates({ booking: b, hasEnded, actions: a, hasCourts: true, hasCanteen: false })
    .canWriteOff
}

describe('slotGates.canWriteOff — "Dar por perdido"', () => {
  it('jugado y con saldo: se ofrece', () => {
    expect(canWriteOff(booking(), true, actions)).toBe(true)
  })

  it('confirmado que ya terminó: se ofrece; si no terminó, no', () => {
    expect(canWriteOff(booking({ status: 'confirmed' }), true, actions)).toBe(true)
    expect(canWriteOff(booking({ status: 'confirmed' }), false, actions)).toBe(false)
  })

  it('sin saldo (cobrado o ya perdido): no se ofrece', () => {
    expect(canWriteOff(booking({ pending: 0 }), true, actions)).toBe(false)
    expect(canWriteOff(booking({ pending: null }), true, actions)).toBe(false)
  })

  it('bloqueo, torneo y ausente: no se ofrece', () => {
    expect(canWriteOff(booking({ type: 'block' }), true, actions)).toBe(false)
    expect(canWriteOff(booking({ type: 'tournament' }), true, actions)).toBe(false)
    expect(canWriteOff(booking({ status: 'no_show' }), true, actions)).toBe(false)
  })

  it('sin las dos acciones (el deshacer va con el botón): no se ofrece', () => {
    expect(canWriteOff(booking(), true, undefined)).toBe(false)
    expect(
      canWriteOff(booking(), true, {
        writeOffBookingAction: vi.fn(),
      } as unknown as SlotPanelActions),
    ).toBe(false)
  })
})
