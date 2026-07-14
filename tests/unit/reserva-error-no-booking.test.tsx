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

describe('ReservaErrorPage (#44)', () => {
  it('sin reserva muestra "No encontramos tu reserva." (no el error de pago)', async () => {
    execute.mockResolvedValue([])
    const ui = await ReservaErrorPage({ params: Promise.resolve({ bookingId: 'missing' }) })
    render(ui)
    expect(screen.getByText('No encontramos tu reserva.')).toBeTruthy()
    expect(screen.queryByText('El pago no se procesó.')).toBeNull()
  })

  it('con reserva existente sí muestra "El pago no se procesó."', async () => {
    execute.mockResolvedValue([
      { status: 'rejected', createdAt: new Date('2020-01-01T00:00:00Z'), tenantSlug: 'cancha-x' },
    ])
    const ui = await ReservaErrorPage({ params: Promise.resolve({ bookingId: 'b1' }) })
    render(ui)
    expect(screen.getByText('El pago no se procesó.')).toBeTruthy()
    expect(screen.queryByText('No encontramos tu reserva.')).toBeNull()
  })
})
