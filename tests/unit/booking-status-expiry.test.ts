import { beforeEach, describe, expect, it, vi } from 'vitest'

// caza-bugs #12: el hold real de una reserva pendiente de pago vence a los
// DEFAULT_EXPIRY_SECONDS (6 min, jobs/definitions.ts), no a los 15 minutos que
// este endpoint (y 3 páginas hermanas) le devolvían al jugador — el contador
// mostraba minutos de más y el jugador confiaba en un margen que ya no
// existía cuando el worker de expiración liberaba el slot.

vi.mock('@/shared/rate-limit/route-guard', () => ({ guard: vi.fn(async () => null) }))
vi.mock('@/shared/api/route-params', () => ({
  parseRouteUuid: vi.fn(() => ({ uuid: 'booking-1' })),
}))

const FAKE_TX = {
  execute: vi.fn(async () => [
    { status: 'pending_payment', depositStatus: 'pending', createdAt: '2026-07-10T12:00:00.000Z' },
  ]),
}

vi.mock('@/server/middleware/with-player', () => ({
  withPlayer:
    (handler: (req: unknown, user: { playerId: string }, tx: unknown) => unknown) =>
    async (req: unknown) =>
      handler(req, { playerId: 'player-1' }, FAKE_TX),
}))

import { GET } from '@/app/api/player/bookings/[id]/status/route'
import { NextRequest } from 'next/server'
import { DEFAULT_EXPIRY_SECONDS } from '@/shared/jobs/definitions'

beforeEach(() => {
  vi.clearAllMocks()
  FAKE_TX.execute.mockResolvedValue([
    { status: 'pending_payment', depositStatus: 'pending', createdAt: '2026-07-10T12:00:00.000Z' },
  ])
})

describe('GET /api/player/bookings/:id/status — expiresAt', () => {
  it('deriva expiresAt de DEFAULT_EXPIRY_SECONDS (6 min), no de 15 min hardcodeados', async () => {
    const req = new NextRequest('http://localhost/api/player/bookings/booking-1/status')
    const res = await GET(req)
    const json = await res.json()

    const createdAtMs = new Date('2026-07-10T12:00:00.000Z').getTime()
    const expectedExpiresAt = new Date(createdAtMs + DEFAULT_EXPIRY_SECONDS * 1000).toISOString()

    expect(DEFAULT_EXPIRY_SECONDS).toBe(6 * 60)
    expect(json.data.expiresAt).toBe(expectedExpiresAt)
    // Regresión directa: si alguien reintroduce el literal de 15 min, esto
    // fallaría porque expiresAt caería 9 minutos más tarde que lo esperado.
    expect(json.data.expiresAt).not.toBe(new Date(createdAtMs + 15 * 60 * 1000).toISOString())
  })
})
