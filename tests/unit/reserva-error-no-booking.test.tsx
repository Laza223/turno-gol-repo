// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TONE_TEXT } from '@/lib/status-tone'
import { HOLD_TTL_SECONDS } from '@/lib/booking/hold'

const { extractAuthUser, execute } = vi.hoisted(() => ({
  extractAuthUser: vi.fn(),
  execute: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  RedirectType: { push: 'push', replace: 'replace' },
  redirect: (url: string, type?: string) => {
    throw new Error(`REDIRECT:${url}${type ? `:${type}` : ''}`)
  },
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser }))
vi.mock('@/shared/db/client', () => ({
  withPlayerContext: (_pid: string, fn: (tx: { execute: typeof execute }) => unknown) =>
    fn({ execute }),
}))
vi.mock('@/app/(public)/[slug]/reservar/actions', () => ({
  retryDepositPaymentAction: vi.fn(),
}))

import ReservaErrorPage from '@/app/reserva/[bookingId]/error/page'

beforeEach(() => {
  vi.clearAllMocks()
  extractAuthUser.mockResolvedValue({
    type: 'player',
    id: 'u1',
    playerId: 'p1',
    email: 'a@b.com',
  })
})
afterEach(() => cleanup())

// Las PKs de bookings son UUID: los ids de fixture tienen que serlo también, o
// el guard de formato (🔴 QA 2026-08-13) corta antes de llegar a la query y el
// test mide otra cosa.
const BOOKING_ID = '11111111-2222-4333-8444-555555555555'

const renderPage = async () =>
  render(await ReservaErrorPage({ params: Promise.resolve({ bookingId: BOOKING_ID }) }))

/** Una fila como la que devuelve la query de la page. */
const row = (status: string, createdAt: Date, over: Record<string, unknown> = {}) => [
  {
    status,
    createdAt,
    date: '2030-06-17',
    // El turno de 00:00 del lunes 17 operativo (closes_next_day) se juega el martes 18.
    startsOn: '2030-06-18',
    timeStart: '20:00:00',
    timeEnd: '21:00:00',
    courtName: 'Cancha 2',
    tenantSlug: 'cancha-x',
    tenantName: 'Cancha X',
    tenantPhone: '341 555-0000',
    tenantWhatsapp: null,
    depositAmount: 500000,
    mpReady: true,
    inProcess: false,
    ...over,
  },
]

describe('ReservaErrorPage (#44)', () => {
  it('sin reserva muestra "No encontramos tu reserva" (no el error de pago)', async () => {
    execute.mockResolvedValue([])
    await renderPage()
    expect(screen.getByText('No encontramos tu reserva')).toBeTruthy()
    expect(screen.queryByText('El pago no se procesó')).toBeNull()
  })

  it('con reserva existente sí muestra "El pago no se procesó"', async () => {
    execute.mockResolvedValue(row('pending_payment', new Date('2020-01-01T00:00:00Z')))
    await renderPage()
    expect(screen.getByText('El pago no se procesó')).toBeTruthy()
    expect(screen.queryByText('No encontramos tu reserva')).toBeNull()
  })

  it('un bookingId que no es UUID no llega a la query y muestra el estado neutro', async () => {
    // Antes del guard, el id crudo entraba al `WHERE b.id = ${bookingId}` de SQL
    // y Postgres tiraba el error de cast, tumbando la página entera.
    const ui = await ReservaErrorPage({ params: Promise.resolve({ bookingId: 'not-a-uuid' }) })
    render(ui)
    expect(execute).not.toHaveBeenCalled()
    expect(screen.getByText('No encontramos tu reserva')).toBeTruthy()
  })
})

describe('ReservaErrorPage — sin sesión', () => {
  it('manda a ingresar CON next a esta misma pantalla (MP puede devolver a otro navegador)', async () => {
    extractAuthUser.mockResolvedValue(null)
    await expect(renderPage()).rejects.toThrow(
      `REDIRECT:/ingresar?next=${encodeURIComponent(`/reserva/${BOOKING_ID}/error`)}`,
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it('con un id que no es UUID no hay a dónde volver: /ingresar sin next', async () => {
    extractAuthUser.mockResolvedValue(null)
    await expect(
      ReservaErrorPage({ params: Promise.resolve({ bookingId: 'not-a-uuid' }) }),
    ).rejects.toThrow(/^REDIRECT:\/ingresar$/)
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('ReservaErrorPage — qué pasó con el turno', () => {
  it('confirmada (llegó el webhook): redirect a /exito con replace, sin mostrar el error', async () => {
    execute.mockResolvedValue(row('confirmed', new Date()))
    await expect(renderPage()).rejects.toThrow(`REDIRECT:/reserva/${BOOKING_ID}/exito:replace`)
  })

  it('pending_payment dentro de la ventana: el turno sigue guardado y se ofrece reintentar, sin cuenta regresiva', async () => {
    execute.mockResolvedValue(row('pending_payment', new Date()))
    const { container } = await renderPage()
    expect(screen.getByText('El pago no se procesó')).toBeTruthy()
    // El plazo es la hora del reloj (ART), nunca "poco tiempo" ni una cuenta regresiva.
    expect(
      screen.getByText(/Tu turno sigue guardado: podés pagar hasta las \d\d:\d\d/),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reintentar pago' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Elegir otro turno' }).getAttribute('href')).toBe(
      '/cancha-x?date=2030-06-17',
    )
    // Sin WhatsApp cargado usa el teléfono del complejo para el wa.me, y el mensaje nombra la reserva.
    const contact = screen.getByRole('link', { name: 'Escribirle al complejo' })
    expect(decodeURIComponent(contact.getAttribute('href')!)).toMatch(
      /^https:\/\/wa\.me\/\d+\?text=Hola Cancha X, te escribo por la seña de mi reserva /,
    )
    // wa.me abre afuera; el tel: (abajo, en las stories) no lleva target.
    expect(contact.getAttribute('target')).toBe('_blank')
    expect(contact.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.queryByRole('link', { name: 'Reservar de nuevo' })).toBeNull()
    // Rojo: el pago falló.
    expect(container.querySelector('svg')?.getAttribute('class')).toContain(TONE_TEXT.destructive)
    // Dice qué turno quedó guardado (día, hora y cancha) sin mostrar cuánto falta para que venza.
    expect(screen.getByText(/^Martes, 18 de junio ·/).closest('p')?.textContent).toBe(
      'Martes, 18 de junio · 20:00 a 21:00 Cancha 2',
    )
    expect(container.textContent!.match(/\d{1,2}:\d\d/g)?.slice(1)).toEqual(['20:00', '21:00'])
    expect(container.textContent).not.toMatch(/\d+ minutos/)
  })

  it.each(['pending_payment', 'expired'])(
    '%s fuera de la ventana: el turno ya no está guardado y "Reservar de nuevo" lleva a la ficha en ese día',
    async (status) => {
      execute.mockResolvedValue(row(status, new Date('2020-01-01T00:00:00Z')))
      const { container } = await renderPage()
      expect(screen.getByText(/el turno ya no está guardado/)).toBeTruthy()
      expect(container.querySelector('svg')?.getAttribute('class')).toContain(TONE_TEXT.destructive)
      expect(screen.queryByRole('button', { name: 'Reintentar pago' })).toBeNull()
      expect(screen.getByRole('link', { name: 'Reservar de nuevo' }).getAttribute('href')).toBe(
        '/cancha-x?date=2030-06-17',
      )
      expect(screen.getByRole('link', { name: 'Escribirle al complejo' })).toBeTruthy()
    },
  )

  it('pending_payment con el hold a punto de vencer (90 s): ya no ofrece reintentar, la preferencia lo sobreviviría', async () => {
    execute.mockResolvedValue(
      row('pending_payment', new Date(Date.now() - (HOLD_TTL_SECONDS - 90) * 1000)),
    )
    await renderPage()
    expect(screen.queryByRole('button', { name: 'Reintentar pago' })).toBeNull()
    expect(screen.queryByText(/Tu turno sigue guardado/)).toBeNull()
    expect(screen.getByText(/el turno ya no está guardado/)).toBeTruthy()
  })

  it('pending_payment con MercadoPago del complejo desconectado: ni "Reintentar pago" ni hora (la acción mandaría a /pendiente sin nada que pagar)', async () => {
    execute.mockResolvedValue(row('pending_payment', new Date(), { mpReady: false }))
    await renderPage()
    expect(screen.getByText('El pago no se procesó')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reintentar pago' })).toBeNull()
    expect(screen.queryByText(/podés pagar hasta las/)).toBeNull()
    expect(screen.getByText(/Por ahora no se puede reintentar el pago desde acá/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Elegir otro turno' }).getAttribute('href')).toBe(
      '/cancha-x?date=2030-06-17',
    )
    expect(screen.getByRole('link', { name: 'Escribirle al complejo' })).toBeTruthy()
  })

  it('pending_payment con otro pago en revisión: no ofrece reintentar (doble cobro)', async () => {
    execute.mockResolvedValue(row('pending_payment', new Date(), { inProcess: true }))
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Tenés un pago en revisión' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reintentar pago' })).toBeNull()
    expect(screen.queryByText(/podés pagar hasta las/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Ver mis reservas' })).toBeTruthy()
  })

  it('expired con el created_at DENTRO de la ventana: el estado manda, no el reloj (sin reintento)', async () => {
    execute.mockResolvedValue(row('expired', new Date()))
    await renderPage()
    expect(screen.getByText(/el turno ya no está guardado/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reintentar pago' })).toBeNull()
    expect(screen.queryByText(/Tu turno sigue guardado/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Reservar de nuevo' }).getAttribute('href')).toBe(
      '/cancha-x?date=2030-06-17',
    )
  })

  it.each(['canceled_refunded', 'canceled_no_refund'])(
    '%s: lo dice y no ofrece reintentar',
    async (status) => {
      execute.mockResolvedValue(row(status, new Date()))
      const { container } = await renderPage()
      expect(screen.getByRole('heading', { name: 'Reserva cancelada' })).toBeTruthy()
      // Gris: cancelar no es una falla del pago.
      expect(container.querySelector('svg')?.getAttribute('class')).toContain(TONE_TEXT.neutral)
      expect(container.querySelector('svg')?.getAttribute('class')).not.toContain('text-red-700')
      expect(screen.queryByRole('button', { name: 'Reintentar pago' })).toBeNull()
    },
  )

  it.each(['completed', 'no_show'])(
    '%s: "Esta reserva ya pasó", no un pago para reintentar',
    async (status) => {
      execute.mockResolvedValue(row(status, new Date()))
      await renderPage()
      expect(screen.getByRole('heading', { name: 'Esta reserva ya pasó' })).toBeTruthy()
      expect(screen.queryByText('El pago no se procesó')).toBeNull()
    },
  )
})
