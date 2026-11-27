import { describe, expect, it, vi } from 'vitest'
import type { DbTx } from '@/shared/db/client'
import { OnlineBookingNotAvailableError } from '@/modules/bookings/booking.errors'
import { assertOnlineBookingOpen } from '@/modules/bookings/online-booking-gate'

// Defensa en profundidad del alta online: el estado se lee dentro de la transacción y un
// complejo en `trial_expired` (o su alias `free`) la rechaza con un error tipado.

function txWithStatus(status: string | null): DbTx {
  return { execute: vi.fn(async () => (status === null ? [] : [{ status }])) } as unknown as DbTx
}

describe('assertOnlineBookingOpen', () => {
  it.each(['trial_expired', 'free'])('%s: tira OnlineBookingNotAvailableError', async (status) => {
    await expect(assertOnlineBookingOpen('t-1', txWithStatus(status))).rejects.toBeInstanceOf(
      OnlineBookingNotAvailableError,
    )
  })

  it.each(['active', 'trialing', 'past_due', 'canceled'])('%s: deja pasar', async (status) => {
    await expect(assertOnlineBookingOpen('t-1', txWithStatus(status))).resolves.toBeUndefined()
  })

  it('un complejo que no existe lo resuelven los chequeos siguientes: no tira acá', async () => {
    await expect(assertOnlineBookingOpen('t-1', txWithStatus(null))).resolves.toBeUndefined()
  })
})
