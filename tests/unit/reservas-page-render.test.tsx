// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReservaListRow } from '@/app/(admin)/reservas/queries'
import { formatArs } from '@/lib/format'

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
// H110 — la page pide las canchas del tenant (filtro por cancha) dentro del
// mismo `withTenantContext`; sin este mock, `listCourts`
// real corre contra el `tx` de mentira de arriba y explota.
const courtsMock = vi.fn(async (): Promise<Array<{ id: string; name: string }>> => [])
vi.mock('@/modules/courts/court.service', () => ({
  listCourts: (...args: unknown[]) => courtsMock(...(args as [])),
}))
vi.mock('@/shared/dates/art', () => ({
  artTodayStr: vi.fn(() => '2026-06-12'),
  addDays: vi.fn((d: string) => d),
}))
const replaceMock = vi.fn()
// `ReservasHeaderBar` (client) lee `useSearchParams()` para preservar el
// resto de los params al pegar `router.replace` — en producción es la MISMA
// URL que ve el server. Acá hay que sincronizarlo a mano por test (mismo
// patrón que tenía `reservas-toolbar.test.tsx`).
let searchParamsInit = ''
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/reservas',
  useSearchParams: () => new URLSearchParams(searchParamsInit),
}))

const listMock = vi.fn(async (): Promise<ReservaListRow[]> => [])
const countsMock = vi.fn(async (): Promise<Record<string, number>> => ({}))
/**
 * Cobros de mostrador por turno. La page los usa para derivar `pending` y
 * decidir la píldora "Por cobrar"; con el Map vacío el saldo sale del
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
  RESERVAS_PAGE_SIZE: 50,
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
  courtsMock.mockResolvedValue([])
  hasMore.value = false
  searchParamsInit = ''
})

describe('ReservasPage — render', () => {
  it('sr-only h1 "Reservas": sin PageHeader, el nombre de la pantalla lo da GrillaTabs', async () => {
    render(await ReservasPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { level: 1, name: 'Reservas' })).toBeTruthy()
  })

  /**
   * 2026-09-24 (docs/decisions/2026-09-24-navegacion-panel.md): el tablero por
   * cancha de Hoy/Próximas se fue. Hoy es una lista agrupada por cancha —el
   * orden que ya trae la query (cancha y después hora)— y la fila no repite
   * la cancha, que es el título de su sección.
   */
  it('hoy: una sección por cancha, en el orden de la query, sin repetir la cancha en la fila', async () => {
    listMock.mockResolvedValue([
      row({ id: 'b1', courtName: 'Cancha 1', timeStart: '14:00:00', timeEnd: '15:00:00' }),
      row({
        id: 'b2',
        courtName: 'Cancha 1',
        timeStart: '16:00:00',
        timeEnd: '17:00:00',
        guestName: 'Ana López',
      }),
      row({ id: 'b3', courtName: 'Cancha 2', timeStart: '09:00:00', timeEnd: '10:00:00' }),
    ])
    countsMock.mockResolvedValue({ confirmed: 3 })

    render(await ReservasPage({ searchParams: Promise.resolve({}) }))

    const secciones = screen.getAllByRole('region')
    expect(secciones.map((r) => r.getAttribute('aria-label'))).toEqual(['Cancha 1', 'Cancha 2'])
    const cancha1 = within(secciones[0]).getAllByRole('article')
    expect(cancha1).toHaveLength(2)
    expect(within(cancha1[0]).getByText('14:00–15:00')).toBeTruthy()
    expect(within(cancha1[1]).getByText('16:00–17:00')).toBeTruthy()
    // La línea secundaria dice la seña, no la cancha (ya es el título).
    expect(within(cancha1[0]).getByText(/Seña pagada/).textContent).not.toContain('Cancha 1')
    expect(within(secciones[1]).getAllByRole('article')).toHaveLength(1)
  })

  it('próximas: una sección por fecha que mezcla canchas, y la fila dice la cancha', async () => {
    listMock.mockResolvedValue([
      row({ id: 'b1', date: '2026-06-13', courtName: 'Cancha 1' }),
      row({ id: 'b2', date: '2026-06-13', courtName: 'Cancha 2', guestName: 'Ana López' }),
    ])
    countsMock.mockResolvedValue({ confirmed: 2 })

    render(await ReservasPage({ searchParams: Promise.resolve({ dia: 'proximas' }) }))

    expect(screen.queryByRole('region', { name: 'Cancha 1' })).toBeNull()
    const dia = screen.getByRole('region', { name: /13 de junio/ })
    const filas = within(dia).getAllByRole('article')
    expect(filas).toHaveLength(2)
    expect(within(filas[1]).getByText(/Cancha 2/)).toBeTruthy()
  })

  it('hoy pagina igual que historial: la query recibe la página', async () => {
    render(await ReservasPage({ searchParams: Promise.resolve({ pagina: '2' }) }))
    expect(listMock).toHaveBeenCalledWith(
      'tenant-1',
      { scope: 'hoy', today: '2026-06-12' },
      expect.anything(),
      1,
    )
  })

  it('cada reserva es un article con aria-label descriptivo', async () => {
    courtsMock.mockResolvedValue([{ id: 'c1', name: 'Cancha 1' }])
    listMock.mockResolvedValue([row({})])
    render(await ReservasPage({ searchParams: Promise.resolve({}) }))

    // GRUPO 3 (3.2): con `sumBookingChargesByBooking` devolviendo un Map vacío,
    // `pending` sale de price_snapshot (2.000.000) − seña paga (500.000) =
    // 1.500.000, así que la fila ahora agrega "Falta $X" al aria-label.
    expect(
      screen.getByRole('article', {
        name: `Reserva 14:00–15:00, Cancha 1, Juan Pérez, Señada, Falta ${formatArs(1500000)}`,
      }),
    ).toBeTruthy()
  })

  it('sin las dos navs de chips viejas: el filtro vive en el popover "Filtros"', async () => {
    render(await ReservasPage({ searchParams: Promise.resolve({}) }))
    expect(screen.queryByRole('navigation', { name: 'Filtro por estado' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Filtro por cancha' })).toBeNull()
    expect(screen.getAllByRole('button', { name: /Filtros/ }).length).toBeGreaterThan(0)
  })

  it('el popover de Filtros muestra Estado con contadores del scope actual', async () => {
    countsMock.mockResolvedValue({
      confirmed: 12,
      pending_payment: 3,
      canceled_refunded: 1,
      canceled_no_refund: 1,
    })
    render(await ReservasPage({ searchParams: Promise.resolve({}) }))

    fireEvent.click(screen.getAllByRole('button', { name: /Filtros/ })[0]!)
    const popover = within(document.body)
    // 'canceladas' agrupa ambos enums; 'Todas' suma todo.
    expect(popover.getByRole('radio', { name: /Confirmadas/ })).toHaveTextContent('12')
    expect(popover.getByRole('radio', { name: /Esperando seña/ })).toHaveTextContent('3')
    expect(popover.getByRole('radio', { name: /Canceladas/ })).toHaveTextContent('2')
    expect(popover.getByRole('radio', { name: /Todas/ })).toHaveTextContent('17')
  })

  it('elegir un estado en el popover navega con router.replace preservando dia y q', async () => {
    // Misma URL que ve el server (línea de arriba) y que `useSearchParams()`
    // devuelve del lado del cliente — en producción son la misma.
    searchParamsInit = 'dia=historial&q=juan'
    render(await ReservasPage({ searchParams: Promise.resolve({ dia: 'historial', q: 'juan' }) }))

    fireEvent.click(screen.getAllByRole('button', { name: /Filtros/ })[0]!)
    const popover = within(document.body)
    fireEvent.click(popover.getByRole('radio', { name: /Esperando seña/ }))

    expect(replaceMock).toHaveBeenCalledWith(
      '/reservas?dia=historial&q=juan&status=pending_payment',
      { scroll: false },
    )
  })

  it('el segmento de rango (Rango de fechas) arma URLs compartibles preservando q', async () => {
    render(await ReservasPage({ searchParams: Promise.resolve({ q: 'juan' }) }))

    const tabs = screen.getAllByRole('navigation', { name: 'Rango de fechas' })[0]!
    expect(within(tabs).getByRole('link', { name: 'Hoy' }).getAttribute('href')).toBe(
      '/reservas?q=juan',
    )
    expect(within(tabs).getByRole('link', { name: 'Próximas' }).getAttribute('href')).toBe(
      '/reservas?dia=proximas&q=juan',
    )
  })

  it('un ?vista viejo (bookmark/compartido) se ignora en silencio', async () => {
    courtsMock.mockResolvedValue([{ id: 'c1', name: 'Cancha 1' }])
    listMock.mockResolvedValue([row({})])
    render(await ReservasPage({ searchParams: Promise.resolve({ vista: 'compacta' } as never) }))
    // No revienta y la fila se ve igual que sin el param.
    expect(screen.getByText('Juan Pérez')).toBeTruthy()
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

describe('ReservasPage — historial', () => {
  it('agrupa por fecha (no por cancha) usando la misma tarjeta de reserva', async () => {
    listMock.mockResolvedValue([
      row({ id: 'b1', date: '2026-06-10', courtName: 'Cancha 1' }),
      row({ id: 'b2', date: '2026-06-10', courtName: 'Cancha 2', guestName: 'Ana López' }),
      row({ id: 'b3', date: '2026-06-09', courtName: 'Cancha 1', guestName: 'Luis Sosa' }),
    ])
    countsMock.mockResolvedValue({ confirmed: 3 })

    render(await ReservasPage({ searchParams: Promise.resolve({ dia: 'historial' }) }))

    // Secciones por fecha, no por cancha.
    expect(screen.queryByRole('region', { name: 'Cancha 1' })).toBeNull()
    const grupo10 = screen.getByRole('region', { name: /10 de junio/ })
    expect(within(grupo10).getAllByRole('article')).toHaveLength(2)
    const grupo9 = screen.getByRole('region', { name: /9 de junio/ })
    expect(within(grupo9).getAllByRole('article')).toHaveLength(1)
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

  it('en la página 2 el rango arranca en 51 y "Anteriores" vuelve a la 1', async () => {
    hasMore.value = false
    listMock.mockResolvedValue([row({ id: 'b1' }), row({ id: 'b2' })])
    // 52 = una página llena (50) + las 2 de acá: la última página, sin "Siguientes".
    countsMock.mockResolvedValue({ confirmed: 52 })

    render(await ReservasPage({ searchParams: Promise.resolve({ dia: 'historial', pagina: '2' }) }))

    expect(screen.getByRole('status').textContent).toContain('51–52')
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

    render(
      await ReservasPage({ searchParams: Promise.resolve({ dia: 'historial', pagina: 'seis' }) }),
    )

    expect(listMock).toHaveBeenCalledWith('tenant-1', expect.anything(), expect.anything(), 0)
  })

  it('un ?pagina negativo tampoco: OFFSET nunca puede ser negativo', async () => {
    listMock.mockResolvedValue([row({})])
    countsMock.mockResolvedValue({ confirmed: 1 })

    render(
      await ReservasPage({ searchParams: Promise.resolve({ dia: 'historial', pagina: '-4' }) }),
    )

    expect(listMock).toHaveBeenCalledWith('tenant-1', expect.anything(), expect.anything(), 0)
  })
})
