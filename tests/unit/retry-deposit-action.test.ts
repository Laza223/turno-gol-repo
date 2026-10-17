import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Reintentar pago" desde /reserva/[id]/error: sin cuenta regresiva el jugador no ve cuánto hold
// queda, así que la action no abre una preferencia nueva si vencería DESPUÉS del hold (un pago que
// entra tarde no confirma la reserva y la seña la tiene que devolver el complejo).

const { redirect, user, execute, createDepositPayment } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  user: vi.fn(),
  execute: vi.fn(),
  createDepositPayment: vi.fn(),
}))

vi.mock('@/modules/auth/auth.service', () => ({
  signInWithGooglePlayer: vi.fn(),
  signInWithPlayerMagicLink: vi.fn(),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: user }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ set: vi.fn(), delete: vi.fn() }),
}))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/shared/rate-limit', () => ({
  enforce: vi.fn(async () => ({ ok: true })),
  parseClientIp: () => '1.1.1.1',
}))
vi.mock('@/shared/db/client', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ mpAccessToken: 'tok' }] }) }),
    }),
  }),
  withPlayerContext: async (_playerId: string, run: (tx: unknown) => unknown) => run({ execute }),
  withTenantContext: vi.fn(),
}))
vi.mock('@/modules/bookings/booking.service', () => ({ createOnlineBooking: vi.fn() }))
vi.mock('@/modules/payments/payment.service', () => ({ createDepositPayment }))
vi.mock('@/modules/payments/mp-oauth', () => ({ resolveTenantGateway: () => ({}) }))

import { retryDepositPaymentAction } from '@/app/(public)/[slug]/reservar/actions'
import { HOLD_TTL_SECONDS } from '@/lib/booking/hold'

const BOOKING_ID = '11111111-2222-4333-8444-555555555555'

function fd(): FormData {
  const f = new FormData()
  f.set('bookingId', BOOKING_ID)
  return f
}

/** Una reserva propia en `pending_payment` a la que le quedan `secondsLeft` de hold. */
function pendingWith(secondsLeft: number) {
  const createdAt = new Date(Date.now() - (HOLD_TTL_SECONDS - secondsLeft) * 1000).toISOString()
  execute.mockResolvedValue([
    { status: 'pending_payment', playerId: 'p1', tenantId: 't1', createdAt },
  ])
}

beforeEach(() => {
  vi.clearAllMocks()
  user.mockResolvedValue({ type: 'player', id: 'u1', playerId: 'p1', email: 'a@b.com' })
  createDepositPayment.mockResolvedValue({ initPoint: 'https://mp.example/checkout' })
})

describe('retryDepositPaymentAction — hold casi vencido', () => {
  it('con hold de sobra abre la preferencia nueva y va a MercadoPago', async () => {
    pendingWith(300)
    await expect(retryDepositPaymentAction(fd())).rejects.toThrow(
      'NEXT_REDIRECT:https://mp.example/checkout',
    )
    expect(createDepositPayment).toHaveBeenCalledTimes(1)
  })

  it.each([90, 30, 0])(
    'con %i s de hold no abre preferencia: vuelve al error, que ya no ofrece reintentar',
    async (secondsLeft) => {
      pendingWith(secondsLeft)
      await expect(retryDepositPaymentAction(fd())).rejects.toThrow(
        `NEXT_REDIRECT:/reserva/${BOOKING_ID}/error`,
      )
      expect(createDepositPayment).not.toHaveBeenCalled()
    },
  )
})

describe('retryDepositPaymentAction — de quién es y en qué estado está', () => {
  it('una reserva ajena no abre preferencia: vuelve a la home', async () => {
    pendingWith(300)
    execute.mockResolvedValue([{ ...(await execute())[0], playerId: 'otro' }])
    await expect(retryDepositPaymentAction(fd())).rejects.toThrow(/^NEXT_REDIRECT:\/$/)
    expect(createDepositPayment).not.toHaveBeenCalled()
  })

  it('una reserva que ya no está pendiente (llegó el webhook) va a /exito sin abrir preferencia', async () => {
    pendingWith(300)
    execute.mockResolvedValue([{ ...(await execute())[0], status: 'confirmed' }])
    await expect(retryDepositPaymentAction(fd())).rejects.toThrow(
      `NEXT_REDIRECT:/reserva/${BOOKING_ID}/exito`,
    )
    expect(createDepositPayment).not.toHaveBeenCalled()
  })
})
