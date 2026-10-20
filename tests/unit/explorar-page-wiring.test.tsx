// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PublicTenantCard } from '@/modules/tenants/search.service'
import { publicTenantCard } from '@/test/fixtures/tenant'

// El cableado de /explorar: la página es quien le pasa a los hijos el día (hora sin día = hoy
// ART), el orden realmente aplicado y el prefijo de ids del sidebar. Los hijos tienen sus
// propios tests; acá se renderiza la página con lo de afuera mockeado.
const findAvailableTenantIds = vi.fn(async (_p: { date: string; time: string }) => [] as string[])
const searchPublicTenants = vi.fn(async () => ({ results: [] as PublicTenantCard[], total: 0 }))

vi.mock('next/cache', () => ({ unstable_cache: <T,>(fn: T) => fn }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/modules/tenants/search.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/tenants/search.service')>()),
  searchPublicTenants: () => searchPublicTenants(),
  listPublicCities: async () => [],
  getCourtPhotosByTenant: async () => ({}),
}))
vi.mock('@/modules/tenants/availability-search.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/tenants/availability-search.service')>()),
  findAvailableTenantIds: (p: { date: string; time: string }) => findAvailableTenantIds(p),
  findFreeSlotPillsByTenant: async () => ({}),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: async () => null }))
vi.mock('@/app/(public)/explorar/components/SearchBand', () => ({ default: () => null }))
vi.mock('@/app/(public)/explorar/components/QuickFilters', () => ({ default: () => null }))
vi.mock('@/app/(public)/explorar/components/EmptyResults', () => ({ default: () => null }))

import ExplorarPage from '@/app/(public)/explorar/page'

async function renderPage(sp: Record<string, string>) {
  render(await ExplorarPage({ searchParams: Promise.resolve(sp) }))
}

beforeEach(() => {
  findAvailableTenantIds.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-06-11T01:30:00.000Z')) // 22:30 ART del 10
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ExplorarPage: cableado', () => {
  it('hora sin día filtra por disponibilidad de hoy (ART)', async () => {
    await renderPage({ time: '20:00' })
    expect(findAvailableTenantIds).toHaveBeenCalledWith({ date: '2026-06-10', time: '20:00' })
  })

  it('hora sin día: el link de la card abre la ficha en el día buscado', async () => {
    searchPublicTenants.mockResolvedValueOnce({
      results: [publicTenantCard({ id: 't1', slug: 'el-potrero', name: 'El Potrero' })],
      total: 1,
    })
    await renderPage({ time: '20:00' })
    expect(screen.getByRole('link', { name: 'El Potrero' }).getAttribute('href')).toBe(
      '/el-potrero?date=2026-06-10',
    )
  })

  it('sin hora no filtra por disponibilidad', async () => {
    await renderPage({})
    expect(findAvailableTenantIds).not.toHaveBeenCalled()
  })

  it('sort=distance sin ubicación: el select muestra el orden aplicado (nombre)', async () => {
    await renderPage({ sort: 'distance' })
    expect(
      (screen.getByRole('combobox', { name: /ordenar por/i }) as HTMLSelectElement).value,
    ).toBe('name')
  })

  it('sort=distance con ubicación: el select dice "Más cercano"', async () => {
    await renderPage({ sort: 'distance', lat: '-34.6', lng: '-58.4' })
    expect(
      (screen.getByRole('combobox', { name: /ordenar por/i }) as HTMLSelectElement).value,
    ).toBe('distance')
  })

  it('el sidebar monta los filtros con ids propios (el drawer queda con #min-price)', async () => {
    await renderPage({})
    expect(document.getElementById('sidebar-min-price')).not.toBeNull()
    expect(document.getElementById('sidebar-max-price')).not.toBeNull()
    expect(document.getElementById('min-price')).toBeNull()
  })
})
