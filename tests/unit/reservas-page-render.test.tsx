// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ReservaListRow } from '@/app/(admin)/reservas/queries'

// B10 — la page pasó a `requireOperatorStaff()`, que además del tenant lee el rol
// contra `tenant_staff_members`. Se mockea el guard, no las dos funciones que
// usaba antes por separado.
vi.mock('@/modules/staff/guards', () => ({
  requireOperatorStaff: vi.fn(async () => ({
    ok: true,
    user: { type: 'staff', staffUserId: 'staff-1' },
    role: 'admin',
    tenant: { id: 'tenant-1' },
  })),
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
/**
 * Cobros de mostrador por turno. La page los usa para derivar `pending` y
 * decidir la píldora "Sin cobrar"; con el Map vacío el saldo sale del
 * price_snapshot menos la seña, que es lo que quieren estos casos.
 */
const chargesMock = vi.fn(async (): Promise<Map<string, number>> => new Map())
/** `hasMore` de la página actual — mutable para poder renderizar el paginador. */
const hasMore = { value: false }
vi.mock('@/app/(admin)/reservas/queries', () => ({
  // El seam sigue devolviendo un array crudo para que cada caso arme su lista
  // con `listMock.mockResolvedValue([...])`; la envoltura de página (B10) se
  // agrega acá una sola vez.
  listTenantBookings: async (...args: unknown[]) => ({
    rows: await listMock(...(args as [])),
    hasMore: hasMore.value,
  }),
  RESERVAS_PAGE_SIZE: 100,
  countTenantBookingsByStatus: (...args: unknown[]) => countsMock(...(args as [])),
  sumBookingChargesByBooking: (...args: unknown[]) => chargesMock(...(args as [])),
}))

import ReservasPage from '@/app/(admin)/reservas/(list)/page'

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
  hasMore.value = false
})

describe('ReservasPage — render', () => {
  it('hoy: agrupa por cancha y muestra el total del día en el subtítulo', async () => {
    listMock.mockResolvedValue([
      row({ id: 'b1', courtName: 'Cancha 1', timeStart: '14:00:00', timeEnd: '15:00:00' }),
      row({
        id: 'b2',
        courtName: 'Cancha 1',
        timeStart: '16:00:00',
        timeEnd: '17:00:00',
        guestName: 'Ana López',
      }),
      row({
        id: 'b3',
        courtName: 'Cancha 2',
        timeStart: '15:00:00',
        timeEnd: '16:00:00',
        guestName: 'Luis Sosa',
      }),
    ])
    countsMock.mockResolvedValue({ confirmed: 3 })

    render(await ReservasPage({ searchParams: Promise.resolve({}) }))

    const cancha1 = screen.getByRole('region', { name: 'Cancha 1' })
    expect(within(cancha1).getAllByRole('article')).toHaveLength(2)
    const cancha2 = screen.getByRole('region', { name: 'Cancha 2' })
    expect(within(cancha2).getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText(/3 reservas/)).toBeTruthy()
  })

  it('cada reserva es un article con aria-label descriptivo', async () => {
    listMock.mockResolvedValue([row({})])
    render(await ReservasPage({ searchParams: Promise.resolve({}) }))

    expect(
      screen.getByRole('article', {
        name: 'Reserva 14:00–15:00, Cancha 1, Juan Pérez, Confirmada',
      }),
    ).toBeTruthy()
  })

  it('las píldoras muestran contadores por estado del scope actual', async () => {
    countsMock.mockResolvedValue({
      confirmed: 12,
      pending_payment: 3,
      canceled_refunded: 1,
      canceled_no_refund: 1,
    })
    render(await ReservasPage({ searchParams: Promise.resolve({}) }))

    const filtros = screen.getByRole('navigation', { name: 'Filtro por estado' })
    expect(within(filtros).getByRole('link', { name: 'Confirmadas 12' })).toBeTruthy()
    expect(within(filtros).getByRole('link', { name: 'Pendientes 3' })).toBeTruthy()
    // 'canceladas' agrupa ambos enums; 'Todas' suma todo.
    expect(within(filtros).getByRole('link', { name: 'Canceladas 2' })).toBeTruthy()
    expect(within(filtros).getByRole('link', { name: 'Todas 17' })).toBeTruthy()
  })

  it('los filtros arman URLs compartibles preservando dia, status y q', async () => {
    render(await ReservasPage({ searchParams: Promise.resolve({ dia: 'historial', q: 'juan' }) }))

    const filtros = screen.getByRole('navigation', { name: 'Filtro por estado' })
    expect(
      within(filtros)
        .getByRole('link', { name: /Pendientes/ })
        .getAttribute('href'),
    ).toBe('/reservas?dia=historial&status=pending_payment&q=juan')
    const tabs = screen.getByRole('navigation', { name: 'Rango de fechas' })
    expect(within(tabs).getByRole('link', { name: 'Hoy' }).getAttribute('href')).toBe(
      '/reservas?q=juan',
    )
  })

  it('?vista=compacta renderiza filas de una línea preservando el aria-label', async () => {
    listMock.mockResolvedValue([row({})])
    render(await ReservasPage({ searchParams: Promise.resolve({ vista: 'compacta' }) }))

    const article = screen.getByRole('article', {
      name: 'Reserva 14:00–15:00, Cancha 1, Juan Pérez, Confirmada',
    })
    // La variante compacta no muestra la línea de seña.
    expect(article.textContent).not.toContain('Seña')
    // Y los filtros preservan la vista en la URL.
    const filtros = screen.getByRole('navigation', { name: 'Filtro por estado' })
    expect(
      within(filtros)
        .getByRole('link', { name: /Confirmadas/ })
        .getAttribute('href'),
    ).toBe('/reservas?status=confirmed&vista=compacta')
  })

  it('la búsqueda se pasa a la query junto al scope', async () => {
    render(await ReservasPage({ searchParams: Promise.resolve({ q: '  maría  ' }) }))
    expect(listMock).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12', q: 'maría' },
      expect.anything(),
      0,
    )
    expect(countsMock).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12', q: 'maría' },
      expect.anything(),
    )
  })
})

/**
 * B10 — la UI que mentía: las píldoras y el subtítulo salen de un COUNT sin
 * techo mientras la lista se cortaba en 200 sin decirlo. Podía decir
 * "740 reservas" y mostrar 200, sin aviso y sin forma de llegar al resto.
 */
describe('ReservasPage — paginación', () => {
  it('sin páginas siguientes NO muestra paginador (ruido en el caso normal)', async () => {
    listMock.mockResolvedValue([row({})])
    countsMock.mockResolvedValue({ confirmed: 1 })

    render(await ReservasPage({ searchParams: Promise.resolve({}) }))

    expect(screen.queryByRole('navigation', { name: 'Paginación de reservas' })).toBeNull()
  })

  it('con más páginas dice qué rango se está viendo y sobre qué total', async () => {
    hasMore.value = true
    listMock.mockResolvedValue([row({ id: 'b1' }), row({ id: 'b2' })])
    countsMock.mockResolvedValue({ confirmed: 740 })

    render(await ReservasPage({ searchParams: Promise.resolve({ dia: 'historial' }) }))

    const aviso = screen.getByRole('status')
    expect(aviso.textContent).toContain('1–2')
    expect(aviso.textContent).toContain('740')
  })

  it('el link "Siguientes" preserva scope, filtro y búsqueda', async () => {
    hasMore.value = true
    listMock.mockResolvedValue([row({})])
    countsMock.mockResolvedValue({ completed: 740 })

    render(
      await ReservasPage({
        searchParams: Promise.resolve({ dia: 'historial', status: 'completed', q: 'juan' }),
      }),
    )

    const pager = screen.getByRole('navigation', { name: 'Paginación de reservas' })
    expect(
      within(pager)
        .getByRole('link', { name: /Siguientes/ })
        .getAttribute('href'),
    ).toBe('/reservas?dia=historial&status=completed&q=juan&pagina=2')
    // En la página 1 no hay "Anteriores".
    expect(within(pager).queryByRole('link', { name: /Anteriores/ })).toBeNull()
  })

  it('en la página 2 el rango arranca en 101 y "Anteriores" vuelve a la 1', async () => {
    hasMore.value = false
    listMock.mockResolvedValue([row({ id: 'b1' }), row({ id: 'b2' })])
    countsMock.mockResolvedValue({ confirmed: 102 })

    render(await ReservasPage({ searchParams: Promise.resolve({ dia: 'historial', pagina: '2' }) }))

    expect(screen.getByRole('status').textContent).toContain('101–102')
    const pager = screen.getByRole('navigation', { name: 'Paginación de reservas' })
    // Sin `?pagina=` — la página 1 es la URL limpia.
    expect(
      within(pager)
        .getByRole('link', { name: /Anteriores/ })
        .getAttribute('href'),
    ).toBe('/reservas?dia=historial')
    expect(within(pager).queryByRole('link', { name: /Siguientes/ })).toBeNull()
  })

  it('un ?pagina basura no rompe: cae a la primera', async () => {
    listMock.mockResolvedValue([row({})])
    countsMock.mockResolvedValue({ confirmed: 1 })

    render(await ReservasPage({ searchParams: Promise.resolve({ pagina: 'seis' }) }))

    expect(listMock).toHaveBeenCalledWith('tenant-1', expect.anything(), expect.anything(), 0)
  })

  it('un ?pagina negativo tampoco: OFFSET nunca puede ser negativo', async () => {
    listMock.mockResolvedValue([row({})])
    countsMock.mockResolvedValue({ confirmed: 1 })

    render(await ReservasPage({ searchParams: Promise.resolve({ pagina: '-4' }) }))

    expect(listMock).toHaveBeenCalledWith('tenant-1', expect.anything(), expect.anything(), 0)
  })
})
