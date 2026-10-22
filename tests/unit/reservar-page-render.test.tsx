// @vitest-environment happy-dom
//
// La page de confirmar (`/[slug]/reservar`) con los servicios mockeados: lo que arma el servidor
// con lo que dice la URL y el complejo. Los componentes de abajo (resumen, pago, ingreso) tienen
// sus tests; acá importa el cableado: qué llega a cada uno desde el tenant y la query.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { availabilityResponse, publicTenant } from '@/test/fixtures/public'

const mocks = vi.hoisted(() => ({
  getPublicTenant: vi.fn(),
  getPublicAvailability: vi.fn(),
  extractAuthUser: vi.fn(),
  getActiveBanReason: vi.fn(),
  userAgent: { current: 'Mozilla/5.0 (Windows NT 10.0) Chrome/126.0' },
}))

vi.mock('@/modules/tenants/public.service', () => ({
  getPublicTenant: mocks.getPublicTenant,
  getPublicAvailability: mocks.getPublicAvailability,
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: mocks.extractAuthUser }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': mocks.userAgent.current }),
  cookies: async () => ({ get: () => undefined }),
}))
// "¿este turno ya es mío?" tiene su propio test (reservar-page-intent); acá nunca lo es.
vi.mock('@/modules/bookings/booking.own', () => ({
  findOwnLiveBooking: async () => null,
}))
// Solo `notFound` se reemplaza; `unstable_rethrow` (la real) la usa el ingreso.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('@/shared/db/client', () => ({
  withPlayerContext: async (_id: string, run: (tx: unknown) => unknown) => run({}),
}))
vi.mock('@/modules/bans/ban.service', () => ({ getActiveBanReason: mocks.getActiveBanReason }))
vi.mock('@/shared/observability', () => ({ track: { funnel: vi.fn() } }))
vi.mock('@/lib/seo/metadata', () => ({ buildMetadata: vi.fn() }))
// Las Server Actions son `'use server'` (arrastran request-context): acá solo se pasan por prop.
vi.mock('@/app/(public)/[slug]/reservar/actions', () => ({
  createBookingAndCheckout: vi.fn(),
  sendPlayerMagicLink: vi.fn(),
  startGoogleLoginFromReservar: vi.fn(),
}))

import ReservarPage from '@/app/(public)/[slug]/reservar/page'

const availability = availabilityResponse()
const [cancha1] = availability.courts
const DATE = '2026-03-14'
// 20:00 está libre en las dos canchas de la fixture, con precio 1.300.000 (centavos).
const base = { court: cancha1!.id, date: DATE, time: '20:00', dur: '60' }

async function renderPage(query: Record<string, string> = {}, slug = 'complejo-fenix') {
  const ui = await ReservarPage({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({ ...base, ...query }),
  })
  return render(ui)
}

/** Cada valor de atributo que no es estilo: ahí también se cuela un monto (aria-label, title, value…). */
const attributes = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('*')).flatMap((el) =>
    Array.from(el.attributes)
      .filter((a) => !['class', 'd', 'style'].includes(a.name))
      .map((a) => `${a.name}=${a.value}`),
  )
const hiddenPay = (root: HTMLElement) =>
  root.querySelector<HTMLInputElement>('form input[type="hidden"][name="pay"]')?.value
const volver = () => screen.getByRole('link', { name: 'Volver' }).getAttribute('href')

beforeEach(() => {
  mocks.userAgent.current = 'Mozilla/5.0 (Windows NT 10.0) Chrome/126.0'
  mocks.getPublicAvailability.mockResolvedValue(availability)
  mocks.extractAuthUser.mockResolvedValue({ type: 'player', playerId: 'p1' })
  mocks.getActiveBanReason.mockResolvedValue(null)
  mocks.getPublicTenant.mockResolvedValue(publicTenant({ requiresDeposit: false }))
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ReservarPage — precios ocultos del complejo', () => {
  it.each([
    ['sin seña', { requiresDeposit: false }],
    ['con seña', { requiresDeposit: true, depositPercentage: 30 }],
  ])('%s: ni un monto en el texto ni en un atributo', async (_name, over) => {
    mocks.getPublicTenant.mockResolvedValue(publicTenant({ ...over, hidePrices: true }))
    const { container } = await renderPage()

    expect(container.textContent).not.toContain('$')
    expect(attributes(container).filter((a) => a.includes('$'))).toEqual([])
    // El precio existe en el slot (la seña se calcula con él): lo que no sale es el monto.
    expect(mocks.getPublicAvailability).toHaveBeenCalledWith(expect.anything(), DATE, {
      keepPrices: true,
    })
  })

  it('control: con los precios visibles el monto sale, así que el test de arriba puede dar rojo', async () => {
    mocks.getPublicTenant.mockResolvedValue(publicTenant({ hidePrices: false }))
    const { container } = await renderPage()
    expect(container.textContent).toContain('$')
  })

  it('con seña y precios ocultos, la nota dice que el resto es en el complejo', async () => {
    mocks.getPublicTenant.mockResolvedValue(
      publicTenant({ hidePrices: true, requiresDeposit: true }),
    )
    await renderPage()
    expect(
      screen.getByText('Pagás una seña online con MercadoPago; el resto, en el complejo.'),
    ).toBeTruthy()
  })
})

describe('ReservarPage — el botón y el `pay` de un link viejo', () => {
  it('no hay sección "Cómo pagás" ni radios, con o sin seña', async () => {
    await renderPage()
    expect(screen.queryByRole('heading', { name: 'Cómo pagás' })).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('sin seña: un solo botón "Reservar" y ningún `pay` por defecto', async () => {
    const { container } = await renderPage()
    expect(screen.getByRole('button', { name: 'Reservar' })).toBeTruthy()
    expect(hiddenPay(container)).toBeUndefined()
  })

  it('un `pay` válido de un link viejo se tolera y viaja', async () => {
    const { container } = await renderPage({ pay: 'transfer' })
    expect(hiddenPay(container)).toBe('transfer')
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it.each(['bitcoin', ''])('un `pay` inválido (%j) se descarta', async (pay) => {
    const { container } = await renderPage({ pay })
    expect(hiddenPay(container)).toBeUndefined()
  })

  it('con seña el botón es "Pagar seña" con el monto, y un `pay` que no es MercadoPago se descarta', async () => {
    mocks.getPublicTenant.mockResolvedValue(
      publicTenant({ requiresDeposit: true, depositPercentage: 30 }),
    )
    const { container } = await renderPage({ pay: 'cash' })
    // Con seña la única vía es MercadoPago y no se elige: un `pay=cash` viejo no viaja.
    expect(hiddenPay(container)).toBeUndefined()
    expect(screen.getByRole('button', { name: /^Pagar seña · \$/ })).toBeTruthy()
  })
})

describe('ReservarPage — la regla de cancelación sale del complejo', () => {
  it('con seña dice las horas del tenant', async () => {
    mocks.getPublicTenant.mockResolvedValue(
      publicTenant({ requiresDeposit: true, cancellationHoursBefore: 48 }),
    )
    await renderPage()
    expect(screen.getByText(/Si cancelás con más de 48 horas de anticipación/)).toBeTruthy()
  })

  it('sin seña no promete ningún plazo', async () => {
    mocks.getPublicTenant.mockResolvedValue(
      publicTenant({ requiresDeposit: false, cancellationHoursBefore: 48 }),
    )
    await renderPage()
    expect(screen.getByText('Podés cancelar desde Mis reservas.')).toBeTruthy()
    expect(screen.queryByText(/48 horas/)).toBeNull()
  })
})

describe('ReservarPage — formato y el camino de vuelta', () => {
  it('"Volver" lleva a la ficha con el día, la hora y el formato elegidos', async () => {
    await renderPage({ formato: '5' })
    expect(volver()).toBe(`/complejo-fenix?date=${DATE}&hora=20%3A00&formato=5`)
  })

  it('"Volver" lleva el anillo de foco del mundo', async () => {
    await renderPage()
    const link = screen.getByRole('link', { name: 'Volver' })
    expect(link.className).toContain('focus-visible:ring-2')
    expect(link.className).toContain('focus-visible:outline-hidden')
  })

  it('un formato que ninguna cancha tiene se descarta', async () => {
    await renderPage({ formato: '99' })
    expect(volver()).toBe(`/complejo-fenix?date=${DATE}&hora=20%3A00`)
  })

  it('"Elegir otro turno" de un error conserva lo mismo que el "Volver"', async () => {
    await renderPage({ formato: '7', error: 'unavailable' })
    const otro = screen.getByRole('link', { name: 'Elegir otro turno' }).getAttribute('href')
    expect(otro).toBe(volver())
    expect(otro).toContain('formato=7')
    expect(otro).toContain('hora=20%3A00')
  })

  it.each([
    ['la cancha ya no existe', { court: '00000000-0000-4000-8000-0000000000ff' }, '20%3A00'],
    ['el turno ya no está libre', { time: '19:00' }, '19%3A00'],
  ])('si %s, la salida vuelve a la ficha con día, hora y formato', async (_name, over, hora) => {
    await renderPage({ formato: '5', ...over })
    const href = screen.getByRole('link', { name: 'Elegir otro turno' }).getAttribute('href')
    expect(href).toBe(`/complejo-fenix?date=${DATE}&hora=${hora}&formato=5`)
  })

  it('con el hueco entre bloques en 32 px (`space-y-8`)', async () => {
    const { container } = await renderPage()
    expect(container.querySelector('.space-y-8')).toBeTruthy()
  })
})

describe('ReservarPage — la sesión y el navegador', () => {
  it('con sesión: el botón de confirmar y la barra fija; sin el ingreso', async () => {
    const { container } = await renderPage()
    expect(screen.getByRole('button', { name: 'Reservar' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(container.querySelector('[data-fixed-cta]')).toBeTruthy()
  })

  it('sin sesión: el mismo botón en la barra fija abre el ingreso, con Google primero; el next conserva cancha, día, hora, formato y pay', async () => {
    mocks.extractAuthUser.mockResolvedValue(null)
    const { container } = await renderPage({ formato: '5', pay: 'transfer' })

    // Cerrado: solo el botón, en la barra fija, y el modal sin montar.
    expect(container.querySelector('[data-fixed-cta]')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reservar' }))

    const dialog = await screen.findByRole('dialog', { name: /Entrá para reservar/ })
    const names = within(dialog)
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => t && t !== 'Cerrar')
    expect(names).toEqual(['Continuar con Google', 'Continuar con mi email'])
    const next = dialog.querySelector<HTMLInputElement>('input[name="next"]')!.value
    expect(next).toBe(
      `/complejo-fenix/reservar?court=${cancha1!.id}&date=${DATE}&time=20:00&dur=60&formato=5&pay=transfer`,
    )
  })

  it('en el navegador interno de Instagram: el email primero y el aviso en lugar de Google', async () => {
    mocks.extractAuthUser.mockResolvedValue(null)
    mocks.userAgent.current = 'Mozilla/5.0 (iPhone) AppleWebKit/605 Mobile/15E148 Instagram 300.0.0'
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Reservar' }))

    const dialog = await screen.findByRole('dialog')
    const names = within(dialog)
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => t && t !== 'Cerrar')
    expect(names).toEqual(['Continuar con mi email', 'Copiar enlace'])
    expect(within(dialog).getByText('¿Querés entrar con Google?')).toBeTruthy()
  })
})

describe('ReservarPage — quién es: solo un jugador envía la reserva', () => {
  it.each([
    [
      'un staff logueado',
      {
        type: 'staff',
        id: 'u1',
        email: 'staff@example.com',
        staffUserId: null,
        tenantId: null,
        role: 'admin',
        forcePasswordChange: false,
      },
    ],
    [
      'un super admin logueado',
      { type: 'system_admin', id: 'u2', email: 'sa@example.com', systemAdminId: 'u2' },
    ],
  ])('%s ve el botón que abre el ingreso, no el que envía la reserva', async (_name, user) => {
    mocks.extractAuthUser.mockResolvedValue(user)
    const { container } = await renderPage()

    // El botón no es de submit (no hay form de confirmar) y abre el ingreso.
    const button = screen.getByRole('button', { name: 'Reservar' })
    expect(button.getAttribute('type')).toBe('button')
    expect(container.querySelector('form')).toBeNull()
    fireEvent.click(button)
    expect(await screen.findByRole('dialog', { name: /Entrá para reservar/ })).toBeTruthy()
  })
})

describe('ReservarPage — el motivo del baneo sale de la DB, nunca de la URL', () => {
  const MOTIVO_DB = 'Ausencias reiteradas (2+ en 90 días).'

  it('un jugador con `?error=banned&reason=FAKE` ve el motivo de la DB y nunca "FAKE"', async () => {
    mocks.getActiveBanReason.mockResolvedValue(MOTIVO_DB)
    const { container } = await renderPage({ error: 'banned', reason: 'FAKE' })

    expect(screen.getByRole('alert').textContent).toContain(`Motivo: ${MOTIVO_DB}`)
    expect(container.textContent).not.toContain('FAKE')
    expect(attributes(container).filter((a) => a.includes('FAKE'))).toEqual([])
    // Lo relee con la identidad del jugador y el complejo de la página.
    expect(mocks.getActiveBanReason).toHaveBeenCalledWith(
      'p1',
      publicTenant().id,
      expect.anything(),
    )
  })

  it('un jugador sin ban activo en la DB: el aviso no inventa un motivo', async () => {
    const { container } = await renderPage({ error: 'banned', reason: 'FAKE' })

    expect(screen.getByRole('alert').textContent).toContain('No podés reservar en este complejo.')
    expect(container.textContent).not.toContain('Motivo')
    expect(container.textContent).not.toContain('FAKE')
  })

  it('un anónimo con `?error=banned&reason=FAKE` no ve ningún motivo, ni se consulta la DB', async () => {
    mocks.extractAuthUser.mockResolvedValue(null)
    mocks.getActiveBanReason.mockResolvedValue(MOTIVO_DB)
    const { container } = await renderPage({ error: 'banned', reason: 'FAKE' })

    expect(screen.getByRole('alert').textContent).toContain('No podés reservar en este complejo.')
    expect(container.textContent).not.toContain('Motivo')
    expect(container.textContent).not.toContain('FAKE')
    expect(container.textContent).not.toContain(MOTIVO_DB)
    expect(mocks.getActiveBanReason).not.toHaveBeenCalled()
  })

  it('con otro error la DB no se consulta y el `reason` de la URL tampoco se muestra', async () => {
    const { container } = await renderPage({ error: 'unavailable', reason: 'FAKE' })

    expect(container.textContent).not.toContain('FAKE')
    expect(mocks.getActiveBanReason).not.toHaveBeenCalled()
  })
})

describe('ReservarPage — lo que no se puede mostrar', () => {
  it('un complejo que no existe es un 404', async () => {
    mocks.getPublicTenant.mockResolvedValue(null)
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('un complejo sin reservas online lo dice y manda a la ficha pelada', async () => {
    mocks.getPublicTenant.mockResolvedValue(publicTenant({ allowOnlineBooking: false }))
    await renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/no toma reservas online/)
    expect(screen.getByRole('link', { name: 'Ver el complejo' }).getAttribute('href')).toBe(
      '/complejo-fenix',
    )
  })

  it('con datos faltantes dice qué falta', async () => {
    await renderPage({ time: '' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'No pudimos abrir este turno',
    )
  })
})
