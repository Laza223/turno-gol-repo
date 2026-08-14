// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const { extractAuthUser, execute } = vi.hoisted(() => ({
  extractAuthUser: vi.fn(),
  execute: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
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

describe('ReservaErrorPage (#44)', () => {
  it('sin reserva muestra "No encontramos tu reserva." (no el error de pago)', async () => {
    execute.mockResolvedValue([])
    const ui = await ReservaErrorPage({ params: Promise.resolve({ bookingId: BOOKING_ID }) })
    render(ui)
    expect(screen.getByText('No encontramos tu reserva.')).toBeTruthy()
    expect(screen.queryByText('El pago no se procesó.')).toBeNull()
  })

  it('con reserva existente sí muestra "El pago no se procesó."', async () => {
    execute.mockResolvedValue([
      { status: 'rejected', createdAt: new Date('2020-01-01T00:00:00Z'), tenantSlug: 'cancha-x' },
    ])
    const ui = await ReservaErrorPage({ params: Promise.resolve({ bookingId: BOOKING_ID }) })
    render(ui)
    expect(screen.getByText('El pago no se procesó.')).toBeTruthy()
    expect(screen.queryByText('No encontramos tu reserva.')).toBeNull()
  })

  it('un bookingId que no es UUID no llega a la query y muestra el estado neutro', async () => {
    // Antes del guard, el id crudo entraba al `WHERE b.id = ${bookingId}` de SQL
    // y Postgres tiraba el error de cast, tumbando la página entera.
    const ui = await ReservaErrorPage({ params: Promise.resolve({ bookingId: 'not-a-uuid' }) })
    render(ui)
    expect(execute).not.toHaveBeenCalled()
    expect(screen.getByText('No encontramos tu reserva.')).toBeTruthy()
  })
})
