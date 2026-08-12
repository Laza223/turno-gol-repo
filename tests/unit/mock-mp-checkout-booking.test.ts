import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Capturamos el execute del db service-role para verificar que un ?booking=
// no-UUID nunca llega al SQL (debe cortar en notFound antes de la query).
const h = vi.hoisted(() => ({ execute: vi.fn() }))

vi.mock('@/shared/db/client', () => ({ getWorkerDb: () => ({ execute: h.execute }) }))
vi.mock('@/app/mock-mp/checkout/actions', () => ({
  mockPay: vi.fn(),
  mockReject: vi.fn(),
  mockCancel: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

import MockMpCheckoutPage from '@/app/mock-mp/checkout/page'

const VALID_UUID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  process.env.MP_MOCK_MODE = '1'
  h.execute.mockReset()
  h.execute.mockResolvedValue([])
})
afterEach(() => {
  delete process.env.MP_MOCK_MODE
})

describe('MockMpCheckoutPage — ?booking UUID (#32)', () => {
  it('404 sin tocar la DB cuando ?booking no es un UUID', async () => {
    await expect(
      MockMpCheckoutPage({ searchParams: Promise.resolve({ booking: 'not-a-uuid' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(h.execute).not.toHaveBeenCalled()
  })

  it('404 cuando el UUID es valido pero no existe la reserva', async () => {
    await expect(
      MockMpCheckoutPage({ searchParams: Promise.resolve({ booking: VALID_UUID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(h.execute).toHaveBeenCalledTimes(1)
  })

  it('renderiza el checkout cuando el UUID resuelve una reserva', async () => {
    h.execute.mockResolvedValueOnce([
      {
        deposit_amount: 5000,
        date: '2026-06-10',
        time_start: '10:00:00',
        time_end: '11:00:00',
        court_name: 'Cancha 1',
        tenant_name: 'Rincón',
        tenant_id: 'tenant-1',
      },
    ])
    const el = await MockMpCheckoutPage({ searchParams: Promise.resolve({ booking: VALID_UUID }) })
    expect(el).toBeTruthy()
    expect(h.execute).toHaveBeenCalledTimes(1)
  })
})

/**
 * B10 — el portón de esta página era `MP_MOCK_MODE !== '1'` a secas: más débil
 * que el de sus propias Server Actions (`actions.ts`, que además exige
 * NODE_ENV) y que el del gateway, cuyo docstring pide explícitamente que sea
 * imposible de activar en producción aunque la variable se filtre.
 */
describe('MockMpCheckoutPage — portón de no-producción', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('404 sin tocar la DB si MP_MOCK_MODE=1 se filtra a producción', async () => {
    // El escenario exacto: con la variable filtrada, las actions ya devolvían
    // 404 pero la página renderizaba, y `loadBookingSummary` lee
    // bookings/courts/tenants CROSS-TENANT con el pool BYPASSRLS y sin auth.
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')

    await expect(
      MockMpCheckoutPage({ searchParams: Promise.resolve({ booking: VALID_UUID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(h.execute).not.toHaveBeenCalled()
  })

  it('un preview de Vercel sí la abre (ahí se corren los E2E)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    h.execute.mockResolvedValueOnce([
      {
        deposit_amount: 5000,
        date: '2026-06-10',
        time_start: '10:00:00',
        time_end: '11:00:00',
        court_name: 'Cancha 1',
        tenant_name: 'Rincón',
        tenant_id: 'tenant-1',
      },
    ])

    const el = await MockMpCheckoutPage({ searchParams: Promise.resolve({ booking: VALID_UUID }) })

    expect(el).toBeTruthy()
  })
})
