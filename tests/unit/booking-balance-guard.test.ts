import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mockeamos las dependencias del guard: el chequeo de ban (devuelve no-baneado)
// y la lectura del PTR. El guard de balance corre ANTES de tocar la cancha/DB,
// así que con estos mocks alcanza para verificar el throw sin DB real.
vi.mock('@/modules/bans/ban.service', () => ({
  checkPlayerBanned: vi.fn(async () => ({ banned: false })),
}))

vi.mock('@/modules/relationships/ptr.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/relationships/ptr.service')>()
  return { ...actual, getPlayerBlockState: vi.fn() }
})

import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { PlayerHasOutstandingBalanceError } from '@/modules/bookings/booking.errors'
import { getPlayerBlockState } from '@/modules/relationships/ptr.service'
import type { DbTx } from '@/shared/db/client'

// Fecha dinámica (mañana): una fecha fija queda en el pasado con el tiempo y el
// servicio tira BookingDateOutOfRangeError antes de llegar al guard de saldo.
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const INPUT = {
  playerId: 'pppppppp-0000-0000-0000-000000000001',
  courtId: 'cccccccc-0000-0000-0000-000000000001',
  date: tomorrow,
  timeStart: '10:00',
  timeEnd: '11:00',
  durationMins: 60 as const,
  requiresDeposit: false,
  depositPercentage: 0,
}

const TENANT_ID = 'tttttttt-0000-0000-0000-000000000001'
const tx = {} as unknown as DbTx

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createOnlineBooking — guard de saldo deudor', () => {
  it('lanza PlayerHasOutstandingBalanceError cuando el jugador tiene deuda', async () => {
    vi.mocked(getPlayerBlockState).mockResolvedValue({ balance: 250000, status: 'active' })
    await expect(createOnlineBooking(TENANT_ID, INPUT, tx)).rejects.toBeInstanceOf(
      PlayerHasOutstandingBalanceError,
    )
  })

  it('lanza PlayerHasOutstandingBalanceError cuando la relación está blocked', async () => {
    vi.mocked(getPlayerBlockState).mockResolvedValue({ balance: 0, status: 'blocked' })
    await expect(createOnlineBooking(TENANT_ID, INPUT, tx)).rejects.toBeInstanceOf(
      PlayerHasOutstandingBalanceError,
    )
  })

  it('NO lanza el error de saldo cuando el jugador está al día (avanza más allá del guard)', async () => {
    vi.mocked(getPlayerBlockState).mockResolvedValue({ balance: 0, status: 'active' })
    // Sin deuda, el guard deja pasar; la creación falla después por el tx falso,
    // pero el error NO debe ser el de saldo deudor.
    await expect(createOnlineBooking(TENANT_ID, INPUT, tx)).rejects.not.toBeInstanceOf(
      PlayerHasOutstandingBalanceError,
    )
  })
})
