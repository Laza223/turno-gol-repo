// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import { publicTenantCard } from '@/test/fixtures/tenant'

// El cableado de /explorar: qué parámetros lee la página, qué le pide a la búsqueda y qué
// horarios de hoy pide. Los hijos tienen sus propios tests; acá se renderiza la página con lo de
// afuera mockeado.
type SearchArgs = Record<string, unknown>
const searchPublicTenants = vi.fn(async (_p: SearchArgs) => ({
  results: [] as PublicTenantCard[],
  total: 0,
}))
const findTodayFreeSlotsByTenant = vi.fn(
  async (_p: { tenantIds: string[]; formats?: number[] }) => ({}),
)

vi.mock('next/cache', () => ({ unstable_cache: <T,>(fn: T) => fn }))
vi.mock('next/image', () => ({
  default: ({ fill: _fill, ...props }: { fill?: boolean } & Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, never>)} />
  },
}))
vi.mock('@/modules/tenants/search.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/tenants/search.service')>()),
  searchPublicTenants: (p: SearchArgs) => searchPublicTenants(p),
  listPublicCities: async () => [],
  listPublicFormatSets: async () => [],
  getCourtPhotosByTenant: async () => ({}),
}))
vi.mock('@/modules/tenants/availability-search.service', () => ({
  findTodayFreeSlotsByTenant: (p: { tenantIds: string[]; formats?: number[] }) =>
    findTodayFreeSlotsByTenant(p),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: async () => null }))
vi.mock('@/components/public/FavoriteButton', () => ({ default: () => null }))
vi.mock('@/app/(public)/explorar/components/ExplorarSearch', () => ({ default: () => null }))
vi.mock('@/app/(public)/explorar/components/EmptyResults', () => ({ default: () => null }))

import ExplorarPage from '@/app/(public)/explorar/page'

async function renderPage(sp: Record<string, string>) {
  render(await ExplorarPage({ searchParams: Promise.resolve(sp) }))
}

beforeEach(() => {
  searchPublicTenants.mockClear()
  findTodayFreeSlotsByTenant.mockClear()
})
afterEach(() => cleanup())

describe('ExplorarPage: cableado', () => {
  it('ignora los filtros que salieron (fecha, hora, superficie, precio, orden)', async () => {
    await renderPage({
      city: 'Luján',
      date: '2026-06-10',
      time: '20:00',
      surfaces: 'synthetic_grass',
      amenities: 'techado',
      online: '1',
      minPrice: '100',
      sort: 'price',
    })
    const args = searchPublicTenants.mock.calls[0]![0]
    expect(args).toMatchObject({ city: 'Luján', sort: 'name' })
    for (const k of ['surfaces', 'amenities', 'onlineOnly', 'minPriceCents', 'tenantIds']) {
      expect(args).not.toHaveProperty(k)
    }
  })

  it('con la ubicación en la URL ordena por cercanía', async () => {
    await renderPage({ city: 'Luján', lat: '-34.57', lng: '-59.11' })
    expect(searchPublicTenants.mock.calls[0]![0]).toMatchObject({
      sort: 'distance',
      lat: -34.57,
      lng: -59.11,
    })
  })

  it('el encabezado dice cuántos complejos hay en la localidad y con qué tamaño', async () => {
    searchPublicTenants.mockResolvedValueOnce({
      results: [publicTenantCard({ id: 't1', slug: 'a', name: 'A' })],
      total: 6,
    })
    await renderPage({ city: 'Luján', formats: '5' })
    expect(screen.getByRole('heading', { level: 1, name: '6 complejos en Luján' })).toBeTruthy()
    expect(
      screen.getByText('Con cancha de Fútbol 5. Los horarios son los libres de hoy.'),
    ).toBeTruthy()
  })

  it('pide los horarios de hoy solo de los complejos con reserva online, con el tamaño', async () => {
    searchPublicTenants.mockResolvedValueOnce({
      results: [
        publicTenantCard({ id: 't1', slug: 'a', name: 'A', allowOnlineBooking: true }),
        publicTenantCard({ id: 't2', slug: 'b', name: 'B', allowOnlineBooking: false }),
      ],
      total: 2,
    })
    await renderPage({ formats: '5,7' })
    expect(findTodayFreeSlotsByTenant).toHaveBeenCalledWith({ tenantIds: ['t1'], formats: [5, 7] })
  })

  it('si los horarios de hoy fallan, la tarjeta no dice que no quedan', async () => {
    searchPublicTenants.mockResolvedValueOnce({
      results: [publicTenantCard({ id: 't1', slug: 'a', name: 'A', allowOnlineBooking: true })],
      total: 1,
    })
    findTodayFreeSlotsByTenant.mockRejectedValueOnce(new Error('worker pool caído'))
    await renderPage({})
    expect(screen.queryByText(/Hoy no le quedan horarios/)).toBeNull()
  })

  it('una ciudad inventada en la URL no rompe la página', async () => {
    await renderPage({ city: 'Ciudad que no existe' })
    expect(
      screen.getByRole('heading', { level: 1, name: '0 complejos en Ciudad que no existe' }),
    ).toBeTruthy()
  })

  it('el link de la tarjeta abre la ficha sin día', async () => {
    searchPublicTenants.mockResolvedValueOnce({
      results: [publicTenantCard({ id: 't1', slug: 'el-potrero', name: 'El Potrero' })],
      total: 1,
    })
    await renderPage({ date: '2026-06-10', time: '20:00', q: 'potrero' })
    expect(screen.getByRole('link', { name: 'El Potrero' }).getAttribute('href')).toBe(
      '/el-potrero',
    )
  })

  it('el botón Mapa conserva los filtros', async () => {
    await renderPage({ city: 'Luján', formats: '5', sort: 'price' })
    expect(screen.getByRole('link', { name: 'Mapa' }).getAttribute('href')).toBe(
      '/explorar?city=Luj%C3%A1n&formats=5&view=map',
    )
  })
})
