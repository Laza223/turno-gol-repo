// @vitest-environment happy-dom
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

const { extractAuthUser, execute } = vi.hoisted(() => {
  // El origen público se lee al cargar `@/lib/seo/metadata`: se fija ANTES de los imports, a un
  // dominio que no puede ser el de producción.
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test')
  return { extractAuthUser: vi.fn(), execute: vi.fn() }
})

vi.mock('next/navigation', () => ({
  RedirectType: { push: 'push', replace: 'replace' },
  redirect: (url: string, type?: string) => {
    throw new Error(`REDIRECT:${url}${type ? `:${type}` : ''}`)
  },
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/reserva/x/pendiente',
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser }))
vi.mock('@/shared/db/client', () => ({
  withPlayerContext: (_pid: string, fn: (tx: { execute: typeof execute }) => unknown) =>
    fn({ execute }),
}))

import { absoluteUrl } from '@/lib/seo/metadata'
import ReservaExitoPage from '@/app/reserva/[bookingId]/exito/page'
import ReservaPendientePage from '@/app/reserva/[bookingId]/pendiente/page'

const BOOKING_ID = '11111111-2222-4333-8444-555555555555'
const params = { params: Promise.resolve({ bookingId: BOOKING_ID }) }

beforeEach(() => {
  vi.clearAllMocks()
  extractAuthUser.mockResolvedValue({ type: 'player', id: 'u1', playerId: 'p1', email: 'a@b.com' })
})
afterEach(() => cleanup())
afterAll(() => vi.unstubAllEnvs())

const confirmedRow = {
  status: 'confirmed',
  createdAt: new Date(),
  depositAmount: 0,
  depositStatus: 'not_required',
  priceSnapshot: 1_234_500,
  hidePrices: false,
  courtName: 'Cancha 2',
  courtFormat: 7,
  tenantName: 'Club Norte',
  tenantSlug: 'club-norte',
  address: 'Av. Siempreviva 742',
  city: 'Rosario',
  latitude: null,
  longitude: null,
  timeStart: '20:00:00',
  timeEnd: '21:00:00',
  date: '2030-06-17',
  // Día operativo lunes 17; el turno se juega el martes 18 (closes_next_day): lo que lee el jugador.
  startsOn: '2030-06-18',
}

describe('sin sesión: las pantallas de vuelta no pierden a dónde iba el jugador', () => {
  it.each([
    ['exito', ReservaExitoPage],
    ['pendiente', ReservaPendientePage],
  ] as const)('%s → /ingresar?next=/reserva/{id}/{vista}', async (view, Page) => {
    extractAuthUser.mockResolvedValue(null)
    await expect(Page(params)).rejects.toThrow(
      `REDIRECT:/ingresar?next=${encodeURIComponent(`/reserva/${BOOKING_ID}/${view}`)}`,
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([
    ['exito', ReservaExitoPage],
    ['pendiente', ReservaPendientePage],
  ] as const)(
    '%s con un id que no es UUID: /ingresar sin next (no hay a dónde volver)',
    async (_view, Page) => {
      extractAuthUser.mockResolvedValue(null)
      await expect(Page({ params: Promise.resolve({ bookingId: 'not-a-uuid' }) })).rejects.toThrow(
        /^REDIRECT:\/ingresar$/,
      )
      expect(execute).not.toHaveBeenCalled()
    },
  )

  it('un staff logueado tampoco es jugador: mismo redirect', async () => {
    extractAuthUser.mockResolvedValue({ type: 'staff' })
    await expect(ReservaExitoPage(params)).rejects.toThrow('REDIRECT:/ingresar?next=')
  })
})

describe('exito', () => {
  it('confirmada: título, formato de la cancha y el link al grupo con el link del complejo', async () => {
    execute.mockResolvedValue([confirmedRow])
    render(await ReservaExitoPage(params))

    expect(screen.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeTruthy()
    const summary = within(screen.getByRole('region', { name: 'Tu turno' }))
    expect(summary.getByText(/^Cancha 2/).textContent).toBe('Cancha 2 · Fútbol 7')
    const share = screen.getByRole('link', { name: 'Avisarle al grupo' })
    const text = decodeURIComponent(share.getAttribute('href')!.split('?text=')[1]!)
    expect(text).toContain('Cancha 2 · Fútbol 7')
    expect(text).toContain('martes 18 de junio')
    expect(text).not.toContain('17 de junio')
    expect(text).toContain('Av. Siempreviva 742, Rosario')
    // El link del complejo sale del origen de la app (acá, el de la env del test), no de un
    // dominio hardcodeado.
    const complexUrl = text.split('\n').at(-1)
    expect(complexUrl).toBe('https://app.example.test/club-norte')
    expect(complexUrl).toBe(absoluteUrl('/club-norte'))
  })

  it('complejo con los precios ocultos: la fila llega a la pantalla y no hay montos en el texto ni en los atributos', async () => {
    execute.mockResolvedValue([
      { ...confirmedRow, hidePrices: true, depositAmount: 345_600, depositStatus: 'paid' },
    ])
    const { container } = render(await ReservaExitoPage(params))

    expect(screen.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeTruthy()
    expect(screen.getByText('Seña pagada, el resto en el complejo')).toBeTruthy()
    const hrefs = [...container.querySelectorAll('a[href]')].map((a) =>
      decodeURIComponent(a.getAttribute('href')!),
    )
    expect(`${container.innerHTML}\n${hrefs.join('\n')}`).not.toMatch(
      /\$|12\.?345|3\.?456|1234500|345600/,
    )
  })

  it('todavía no confirmada (volvió de MP antes del webhook): la espera, no el éxito', async () => {
    execute.mockResolvedValue([{ ...confirmedRow, status: 'pending_payment' }])
    render(await ReservaExitoPage(params))
    expect(screen.getByRole('heading', { name: 'Confirmando tu pago…' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Avisarle al grupo' })).toBeNull()
  })

  it('sin reserva: estado neutro', async () => {
    execute.mockResolvedValue([])
    render(await ReservaExitoPage(params))
    expect(screen.getByText('No encontramos tu reserva')).toBeTruthy()
  })
})

describe('pendiente', () => {
  it('ya confirmada (el webhook llegó antes): redirect a /exito con replace', async () => {
    execute.mockResolvedValue([
      { status: 'confirmed', createdAt: new Date(), date: '2030-06-17', tenantSlug: 'club-norte' },
    ])
    await expect(ReservaPendientePage(params)).rejects.toThrow(
      `REDIRECT:/reserva/${BOOKING_ID}/exito:replace`,
    )
  })

  it('pending_payment: la espera, sin cuenta regresiva', async () => {
    execute.mockResolvedValue([
      {
        status: 'pending_payment',
        createdAt: new Date(),
        date: '2030-06-17',
        tenantSlug: 'club-norte',
      },
    ])
    const { container } = render(await ReservaPendientePage(params))
    expect(screen.getByRole('heading', { name: 'Confirmando tu pago…' })).toBeTruthy()
    expect(container.textContent).not.toMatch(/te queda|\d:\d\d/i)
  })
})
