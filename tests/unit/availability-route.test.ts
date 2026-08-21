import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/modules/tenants/public.service', () => ({
  getPublicTenant: vi.fn(),
  getPublicAvailability: vi.fn(),
}))

import { getPublicTenant, getPublicAvailability } from '@/modules/tenants/public.service'

const todayStr = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

function req(slug: string, date: string) {
  return new NextRequest(`http://localhost/api/public/availability?slug=${slug}&date=${date}`)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/public/availability — tenant status gating', () => {
  it('returns 404 not_found for an unavailable tenant (suspended)', async () => {
    vi.mocked(getPublicTenant).mockResolvedValue({
      status: 'suspended',
      bookingAdvanceDays: 6,
    } as never)
    const { GET } = await import('@/app/api/public/availability/route')
    const res = await GET(req('rincon', todayStr))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(getPublicAvailability).not.toHaveBeenCalled()
  })

  it('returns availability for an active tenant', async () => {
    vi.mocked(getPublicTenant).mockResolvedValue({
      status: 'active',
      bookingAdvanceDays: 6,
    } as never)
    vi.mocked(getPublicAvailability).mockResolvedValue({ courts: [] } as never)
    const { GET } = await import('@/app/api/public/availability/route')
    const res = await GET(req('rincon', todayStr))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ courts: [] })
  })

  /**
   * Baja voluntaria (doc4 §2): el complejo sigue operando hasta el fin del
   * período que pagó. El perfil público ya lo respetaba vía `isPublicPortalOpen`,
   * pero esta ruta seguía con el gate viejo por status pelado — así que el
   * perfil se veía con precios y la grilla de disponibilidad adentro devolvía
   * 404, que la UI mostraba como "revisá tu conexión". Encontrado en producción.
   */
  it('sirve disponibilidad a un complejo en baja voluntaria con período pago vigente', async () => {
    vi.mocked(getPublicTenant).mockResolvedValue({
      status: 'canceled',
      canceledPeriodEnd: new Date(Date.now() + 30 * 24 * 3_600_000),
      bookingAdvanceDays: 6,
    } as never)
    vi.mocked(getPublicAvailability).mockResolvedValue({ courts: [] } as never)
    const { GET } = await import('@/app/api/public/availability/route')
    const res = await GET(req('rincon', todayStr))
    expect(res.status).toBe(200)
  })

  it('cierra al complejo en baja cuyo período pago ya venció', async () => {
    vi.mocked(getPublicTenant).mockResolvedValue({
      status: 'canceled',
      canceledPeriodEnd: new Date(Date.now() - 24 * 3_600_000),
      bookingAdvanceDays: 6,
    } as never)
    const { GET } = await import('@/app/api/public/availability/route')
    const res = await GET(req('rincon', todayStr))
    expect(res.status).toBe(404)
    expect(getPublicAvailability).not.toHaveBeenCalled()
  })

  /** Baja sin fila de suscripción: sin fecha de corte no hay período que honrar. */
  it('cierra al complejo en baja sin período pago conocido', async () => {
    vi.mocked(getPublicTenant).mockResolvedValue({
      status: 'canceled',
      canceledPeriodEnd: null,
      bookingAdvanceDays: 6,
    } as never)
    const { GET } = await import('@/app/api/public/availability/route')
    const res = await GET(req('rincon', todayStr))
    expect(res.status).toBe(404)
  })
})
