// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ReservaListRow } from '@/app/(admin)/reservas/queries'

vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(async () => ({ type: 'staff', staffUserId: 'staff-1' })),
}))
vi.mock('@/modules/tenants/tenant.service', () => ({
  getStaffTenant: vi.fn(async () => ({ id: 'tenant-1' })),
}))
vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(async (_id: string, cb: (tx: unknown) => unknown) => cb({})),
}))
vi.mock('@/shared/dates/art', () => ({
  artTodayStr: vi.fn(() => '2026-06-12'),
  addDays: vi.fn((d: string) => d),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/reservas',
  useSearchParams: () => new URLSearchParams(),
}))

const listMock = vi.fn(async (): Promise<ReservaListRow[]> => [])
const countsMock = vi.fn(async (): Promise<Record<string, number>> => ({}))
vi.mock('@/app/(admin)/reservas/queries', () => ({
  listTenantBookings: (...args: unknown[]) => listMock(...(args as [])),
  countTenantBookingsByStatus: (...args: unknown[]) => countsMock(...(args as [])),
}))

import ReservasPage from '@/app/(admin)/reservas/page'

function row(overrides: Partial<ReservaListRow>): ReservaListRow {
  return {
    id: 'b1',
    date: '2026-06-12',
    timeStart: '14:00:00',
    timeEnd: '15:00:00',
    status: 'confirmed',
    type: 'spontaneous',
    courtName: 'Cancha 1',
    playerName: null,
    guestName: 'Juan Pérez',
    priceSnapshot: 2000000,
    depositAmount: 500000,
    depositStatus: 'paid',
    paymentMethod: 'cash',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  listMock.mockResolvedValue([])
  countsMock.mockResolvedValue({})
})

describe('ReservasPage — render', () => {
  it('hoy: agrupa por cancha y muestra el total del día en el subtítulo', async () => {
    listMock.mockResolvedValue([
      row({ id: 'b1', courtName: 'Cancha 1', timeStart: '14:00:00', timeEnd: '15:00:00' }),
      row({ id: 'b2', courtName: 'Cancha 1', timeStart: '16:00:00', timeEnd: '17:00:00', guestName: 'Ana López' }),
      row({ id: 'b3', courtName: 'Cancha 2', timeStart: '15:00:00', timeEnd: '16:00:00', guestName: 'Luis Sosa' }),
    ])
    countsMock.mockResolvedValue({ confirmed: 3 })

    render(await ReservasPage({ searchParams: {} }))

    const cancha1 = screen.getByRole('region', { name: 'Cancha 1' })
    expect(within(cancha1).getAllByRole('article')).toHaveLength(2)
    const cancha2 = screen.getByRole('region', { name: 'Cancha 2' })
    expect(within(cancha2).getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText(/3 reservas/)).toBeTruthy()
  })

  it('cada reserva es un article con aria-label descriptivo', async () => {
    listMock.mockResolvedValue([row({})])
    render(await ReservasPage({ searchParams: {} }))

    expect(
      screen.getByRole('article', { name: 'Reserva 14:00–15:00, Cancha 1, Juan Pérez, Confirmada' }),
    ).toBeTruthy()
  })

  it('las píldoras muestran contadores por estado del scope actual', async () => {
    countsMock.mockResolvedValue({
      confirmed: 12,
      pending_payment: 3,
      canceled_refunded: 1,
      canceled_no_refund: 1,
    })
    render(await ReservasPage({ searchParams: {} }))

    const filtros = screen.getByRole('navigation', { name: 'Filtro por estado' })
    expect(within(filtros).getByRole('link', { name: 'Confirmadas 12' })).toBeTruthy()
    expect(within(filtros).getByRole('link', { name: 'Pendientes 3' })).toBeTruthy()
    // 'canceladas' agrupa ambos enums; 'Todas' suma todo.
    expect(within(filtros).getByRole('link', { name: 'Canceladas 2' })).toBeTruthy()
    expect(within(filtros).getByRole('link', { name: 'Todas 17' })).toBeTruthy()
  })

  it('los filtros arman URLs compartibles preservando dia, status y q', async () => {
    render(await ReservasPage({ searchParams: { dia: 'historial', q: 'juan' } }))

    const filtros = screen.getByRole('navigation', { name: 'Filtro por estado' })
    expect(within(filtros).getByRole('link', { name: /Pendientes/ }).getAttribute('href')).toBe(
      '/reservas?dia=historial&status=pending_payment&q=juan',
    )
    const tabs = screen.getByRole('navigation', { name: 'Rango de fechas' })
    expect(within(tabs).getByRole('link', { name: 'Hoy' }).getAttribute('href')).toBe('/reservas?q=juan')
  })

  it('?vista=compacta renderiza filas de una línea preservando el aria-label', async () => {
    listMock.mockResolvedValue([row({})])
    render(await ReservasPage({ searchParams: { vista: 'compacta' } }))

    const article = screen.getByRole('article', {
      name: 'Reserva 14:00–15:00, Cancha 1, Juan Pérez, Confirmada',
    })
    // La variante compacta no muestra la línea de seña.
    expect(article.textContent).not.toContain('Seña')
    // Y los filtros preservan la vista en la URL.
    const filtros = screen.getByRole('navigation', { name: 'Filtro por estado' })
    expect(within(filtros).getByRole('link', { name: /Confirmadas/ }).getAttribute('href')).toBe(
      '/reservas?status=confirmed&vista=compacta',
    )
  })

  it('la búsqueda se pasa a la query junto al scope', async () => {
    render(await ReservasPage({ searchParams: { q: '  maría  ' } }))
    expect(listMock).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12', q: 'maría' },
      expect.anything(),
    )
    expect(countsMock).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12', q: 'maría' },
      expect.anything(),
    )
  })
})
