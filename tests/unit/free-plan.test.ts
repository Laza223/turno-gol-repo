import { describe, expect, it } from 'vitest'
import {
  artMonthOf,
  effectiveAllowOnlineBooking,
  isFreePlan,
} from '@/modules/tenants/tenant.lifecycle'
import { FREE_PLAN_BOOKING_ERROR, freePlanBookingError } from '@/modules/bookings/free-plan-block'
import { FREE_PLAN_BLOCK_REASONS } from '@/shared/constants'
import { isOnlineBooking, maskGridBookingForFreePlan } from '@/lib/booking/free-plan-mask'
import { visibleNavItems } from '@/components/layout/admin-sidebar'
import { gridMoneyVisual } from '@/lib/booking/slot-visual'
import type { GridBooking } from '@/lib/booking/grid-cells'

// Freemium (docs/decisions/2026-11-08-freemium-spec-y-estado-free.md y su corte v2).

describe('isFreePlan', () => {
  it.each(['trialing', 'active', 'past_due', 'suspended', 'blocked', 'canceled', 'churned'])(
    '%s no es gratis',
    (status) => expect(isFreePlan({ status })).toBe(false),
  )
  it('free es gratis', () => expect(isFreePlan({ status: 'free' })).toBe(true))
})

describe('artMonthOf: el mes es el de Argentina, no el de UTC', () => {
  it('las 22:00 ART del 30/11 (01:00 UTC del 1/12) siguen en noviembre', () => {
    expect(artMonthOf(new Date('2026-12-01T01:00:00Z'))).toBe('2026-11')
  })
  it('las 00:00 ART del 1/12 (03:00 UTC) ya son diciembre', () => {
    expect(artMonthOf(new Date('2026-12-01T03:00:00Z'))).toBe('2026-12')
  })
})

describe('effectiveAllowOnlineBooking', () => {
  const NOW = new Date('2026-11-15T15:00:00Z')
  const base = { status: 'free', allowOnlineBookingSetting: true, onlinePausedAt: null }

  it('el ajuste apagado manda para todos', () => {
    expect(
      effectiveAllowOnlineBooking({ ...base, status: 'active', allowOnlineBookingSetting: false }),
    ).toBe(false)
  })
  it('un pago ignora la pausa', () => {
    expect(effectiveAllowOnlineBooking({ ...base, status: 'active', onlinePausedAt: NOW })).toBe(
      true,
    )
  })
  it('gratis sin pausa: abierta, sin tope (freemium v2)', () => {
    expect(effectiveAllowOnlineBooking(base)).toBe(true)
  })
  it('gratis en pausa: cerrada', () => {
    expect(effectiveAllowOnlineBooking({ ...base, onlinePausedAt: NOW })).toBe(false)
  })
})

// Freemium v2 (docs/decisions/2026-11-15-freemium-corte-v2.md): "gratis es quién
// juega; el plan es quién pagó".
describe('freePlanBookingError: en gratis se anota quién juega, sin plata ni notas', () => {
  const block = { type: 'block' as const }
  const turno = { type: 'spontaneous' as const, guestName: 'Juan' }

  it('acepta un turno con nombre', () => {
    expect(freePlanBookingError(turno)).toBeNull()
  })
  it('acepta un turno con nombre y teléfono, en $0', () => {
    expect(
      freePlanBookingError({ ...turno, guestPhone: '1122334455', priceOverride: 0 }),
    ).toBeNull()
  })
  it.each(FREE_PLAN_BLOCK_REASONS)('acepta el bloqueo con el motivo cerrado %s', (guestName) => {
    expect(freePlanBookingError({ ...block, guestName })).toBeNull()
  })
  it('un bloqueo sin motivo cuenta como Ocupado', () => {
    expect(freePlanBookingError(block)).toBeNull()
  })
  it.each([
    [
      'un turno con jugador vinculado',
      { type: 'spontaneous' as const, playerId: '33333333-3333-4333-8333-333333333333' },
    ],
    ['un turno con nota interna', { ...turno, notesInternal: 'Paga el lunes' }],
    ['un turno con nota al jugador', { ...turno, notesPlayer: 'Traé pelota' }],
    ['un turno con precio', { ...turno, priceOverride: 1000 }],
    [
      'un turno con cobro',
      { ...turno, depositAmount: 500, depositMethod: 'cash', depositStatus: 'paid' },
    ],
    ['un bloqueo con motivo libre', { ...block, guestName: 'Juan Pérez' }],
    ['un bloqueo con teléfono', { ...block, guestPhone: '1122334455' }],
    ['un bloqueo con precio', { ...block, priceOverride: 1000 }],
  ])('rechaza %s', (_label, input) => {
    expect(freePlanBookingError(input)).toBe(FREE_PLAN_BOOKING_ERROR)
  })
})

describe('maskGridBookingForFreePlan', () => {
  const row: GridBooking = {
    id: 'b1',
    courtId: 'c1',
    date: '2026-11-15',
    timeStart: '20:00',
    timeEnd: '21:00',
    status: 'confirmed',
    type: 'spontaneous',
    guestName: 'Juan',
    playerFirstName: 'Ana',
    playerLastName: 'Gómez',
    priceSnapshot: 3_000_000,
    paymentMethod: 'cash',
    depositStatus: 'paid',
    depositAmount: 900_000,
    totalPaid: 900_000,
    pending: 2_100_000,
    writtenOff: 0,
  }

  it('lo que anotó el staff conserva el nombre y pierde la plata', () => {
    const m = maskGridBookingForFreePlan(row, false)
    expect(m.guestName).toBe('Juan')
    expect(m.playerFirstName).toBe('Ana')
    expect(m.playerLastName).toBe('Gómez')
    expect(m.priceSnapshot).toBe(0)
    expect(m.pending).toBe(0)
    expect(m.totalPaid).toBe(0)
    expect(m.depositAmount).toBe(0)
    expect(m.paymentMethod).toBeNull()
    // Sin esto la celda leía el saldo en 0 como "Pagado" o "No se cobra".
    expect(gridMoneyVisual({ ...m, started: true, ended: true }).label).toBe('')
  })
  it('un bloqueo conserva su motivo', () => {
    const m = maskGridBookingForFreePlan(
      { ...row, type: 'block', guestName: 'Mantenimiento' },
      false,
    )
    expect(m.guestName).toBe('Mantenimiento')
  })
  it('la online conserva el nombre del jugador y el precio, sin saldo', () => {
    const m = maskGridBookingForFreePlan(row, true)
    expect(m.playerFirstName).toBe('Ana')
    expect(m.priceSnapshot).toBe(3_000_000)
    expect(m.pending).toBe(0)
  })
  it('isOnlineBooking: spontaneous sin staff', () => {
    expect(isOnlineBooking({ type: 'spontaneous', createdByStaff: null })).toBe(true)
    expect(isOnlineBooking({ type: 'spontaneous', createdByStaff: 's1' })).toBe(false)
    expect(isOnlineBooking({ type: 'abonado', createdByStaff: null })).toBe(false)
  })
})

describe('menú del panel en el plan gratis', () => {
  it('Caja y Clientes y Fijos llevan a /reactivar, marcados, y van al final', () => {
    const items = visibleNavItems({ staffRole: 'admin', freePlan: true })
    const locked = items.filter((i) => i.planLocked)
    expect(locked.map((i) => i.label)).toEqual(['Caja', 'Clientes y Fijos'])
    expect(locked.every((i) => i.href === '/reactivar')).toBe(true)
    expect(items.slice(0, 3).map((i) => i.label)).toEqual(['Hoy', 'Grilla', 'Canchas'])
  })
  it('en el plan pago no cambia nada', () => {
    const items = visibleNavItems({ staffRole: 'admin' })
    expect(items.some((i) => i.planLocked)).toBe(false)
    expect(items[2]!.label).toBe('Caja')
  })
})
