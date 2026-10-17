import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { addDays, artTodayStr } from '@/shared/dates/art'
import type { AvailabilityResponse, PublicSlot } from '@/modules/tenants/public.service'

vi.mock('@/modules/tenants/public.service', () => ({
  getPublicTenant: vi.fn(),
  getPublicAvailability: vi.fn(),
}))
vi.mock('@/lib/story-image/render', () => ({
  renderStoryPng: vi.fn(),
}))
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}))

import { getPublicAvailability, getPublicTenant } from '@/modules/tenants/public.service'
import { renderStoryPng } from '@/lib/story-image/render'
import { captureException } from '@/lib/sentry'
import { GET } from '@/app/api/public/story/route'

const TODAY = artTodayStr()

const TENANT = {
  slug: 'm10',
  name: 'M10 Menotti',
  phone: '351 123-4567',
  whatsapp: null,
  status: 'active',
  canceledPeriodEnd: null,
  allowOnlineBooking: true,
  bookingAdvanceDays: 6,
}

function slot(time: string, status: PublicSlot['status'] = 'free'): PublicSlot {
  return { time, duration: 60, status, price: 2500000 }
}

function availability(slots: PublicSlot[], date = TODAY): AvailabilityResponse {
  return {
    date,
    courts: [
      {
        id: 'c1',
        name: 'Cancha 1',
        surfaceType: 'synthetic',
        isCovered: false,
        hasLighting: true,
        slots,
      },
    ],
  }
}

function req(query: string) {
  return new NextRequest(`http://localhost/api/public/story${query}`)
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPublicTenant).mockResolvedValue(TENANT as never)
  vi.mocked(getPublicAvailability).mockResolvedValue(availability([slot('23:00')]))
  vi.mocked(renderStoryPng).mockResolvedValue(PNG_BYTES)
})

describe('GET /api/public/story', () => {
  it('devuelve el PNG con caché corto y sin stale-while-revalidate', async () => {
    const res = await GET(req(`?slug=m10&date=${TODAY}`))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=30')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(PNG_BYTES))
  })

  it('le pasa al render un modelo armado con el link del complejo', async () => {
    await GET(req(`?slug=m10&date=${TODAY}`))
    expect(renderStoryPng).toHaveBeenCalledTimes(1)
    const model = vi.mocked(renderStoryPng).mock.calls[0][0]
    expect(model.tenantName).toBe('M10 Menotti')
    expect(model.hours).toEqual([{ time: '23:00', freeCourts: 1 }])
    expect(model.portalHost).toMatch(/\/m10$/)
    expect(model.cta).toBe('RESERVÁ TU CANCHA')
  })

  it('la URL de la placa es la pública del complejo: NEXT_PUBLIC_APP_URL y, sin ella, el origin del request', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://turnogol.app')
    await GET(req(`?slug=m10&date=${TODAY}`))
    expect(vi.mocked(renderStoryPng).mock.calls[0][0].portalHost).toBe('turnogol.app/m10')

    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    await GET(req(`?slug=m10&date=${TODAY}`))
    expect(vi.mocked(renderStoryPng).mock.calls[1][0].portalHost).toBe('localhost/m10')
  })

  it('400 si faltan o vienen mal los parámetros', async () => {
    for (const query of [
      '',
      '?slug=m10',
      `?date=${TODAY}`,
      `?slug=M10 X&date=${TODAY}`,
      '?slug=m10&date=2026-13-45',
    ]) {
      const res = await GET(req(query))
      expect(res.status, query).toBe(400)
      expect((await res.json()).error.code).toBe('INVALID_PARAMS')
    }
    expect(getPublicTenant).not.toHaveBeenCalled()
  })

  it('404 si el complejo no existe', async () => {
    vi.mocked(getPublicTenant).mockResolvedValue(null as never)
    const res = await GET(req(`?slug=fantasma&date=${TODAY}`))
    expect(res.status).toBe(404)
    expect(getPublicAvailability).not.toHaveBeenCalled()
  })

  it.each(['suspended', 'blocked', 'churned', 'deleted'])(
    '404 si el complejo está %s',
    async (status) => {
      vi.mocked(getPublicTenant).mockResolvedValue({ ...TENANT, status } as never)
      const res = await GET(req(`?slug=m10&date=${TODAY}`))
      expect(res.status).toBe(404)
      expect(getPublicAvailability).not.toHaveBeenCalled()
      expect(renderStoryPng).not.toHaveBeenCalled()
    },
  )

  it('404 si la baja voluntaria ya cumplió su período pago', async () => {
    vi.mocked(getPublicTenant).mockResolvedValue({
      ...TENANT,
      status: 'canceled',
      canceledPeriodEnd: new Date(Date.now() - 24 * 3_600_000),
    } as never)
    const res = await GET(req(`?slug=m10&date=${TODAY}`))
    expect(res.status).toBe(404)
  })

  it('sirve a un complejo en baja voluntaria con el período pago vigente', async () => {
    vi.mocked(getPublicTenant).mockResolvedValue({
      ...TENANT,
      status: 'canceled',
      canceledPeriodEnd: new Date(Date.now() + 30 * 24 * 3_600_000),
    } as never)
    const res = await GET(req(`?slug=m10&date=${TODAY}`))
    expect(res.status).toBe(200)
  })

  it('acepta desde hoy hasta hoy + los días de anticipación y rechaza lo de afuera', async () => {
    const last = addDays(TODAY, TENANT.bookingAdvanceDays)
    vi.mocked(getPublicAvailability).mockResolvedValue(availability([slot('23:00')], last))
    expect((await GET(req(`?slug=m10&date=${last}`))).status).toBe(200)

    for (const date of [addDays(TODAY, -1), addDays(last, 1)]) {
      const res = await GET(req(`?slug=m10&date=${date}`))
      expect(res.status, date).toBe(400)
      expect((await res.json()).error.code).toBe('DATE_OUT_OF_RANGE')
    }
  })

  it('409 con el motivo cuando no hay placa que mostrar', async () => {
    vi.mocked(getPublicAvailability).mockResolvedValue(
      availability([slot('22:00', 'occupied'), slot('23:00', 'held')]),
    )
    const res = await GET(req(`?slug=m10&date=${TODAY}`))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('STORY_FULL')
    expect(body.error.message).toContain('No quedan turnos libres')
    expect(renderStoryPng).not.toHaveBeenCalled()
  })

  it('409 si el complejo no tiene canchas online', async () => {
    vi.mocked(getPublicAvailability).mockResolvedValue({ date: TODAY, courts: [] })
    const res = await GET(req(`?slug=m10&date=${TODAY}`))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('STORY_NO_COURTS')
  })

  it('500 con mensaje legible si el render falla, y lo reporta', async () => {
    const boom = new Error('satori se cayó')
    vi.mocked(renderStoryPng).mockRejectedValue(boom)
    const res = await GET(req(`?slug=m10&date=${TODAY}`))
    expect(res.status).toBe(500)
    expect((await res.json()).error.message).toBe('No se pudo generar la imagen.')
    expect(captureException).toHaveBeenCalledWith(boom)
  })
})
