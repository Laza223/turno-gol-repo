// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import TenantHeader from '@/app/(public)/[slug]/components/TenantHeader'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import type { PortalSession } from '@/components/site/portal-session'
import type { PublicTenant } from '@/modules/tenants/public.service'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const tenant = {
  id: 't1',
  slug: 'cancha-x',
  name: 'Cancha X',
  description: null,
  logoUrl: null,
  coverUrl: null,
  address: 'Calle 1',
  city: 'CABA',
  province: 'Buenos Aires',
  phone: '+5491100000000',
  whatsapp: null,
  openingHours: {},
  closedDates: [],
  status: 'active',
  timezone: 'America/Argentina/Buenos_Aires',
  allowOnlineBooking: true,
  requiresDeposit: false,
  depositPercentage: 0,
  bookingAdvanceDays: 6,
  amenities: {},
  latitude: null,
  longitude: null,
} as unknown as PublicTenant

const session: PortalSession = {
  playerId: 'p1',
  firstName: 'Tomás',
  lastName: 'Gómez',
  avatarUrl: null,
  email: 'tomas@example.com',
}

function mockSessionFetch(favoriteTenantIds: string[]) {
  global.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: { session, favoriteTenantIds } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof global.fetch
}

// El perfil del complejo es ISR: el server siempre renderiza "Guardar" y el
// estado real del favorito se hidrata desde GET /api/player/session (#40).
describe('TenantHeader favorito (#40)', () => {
  it('con el tenant entre los favoritos de la sesión, el botón hidrata a "Guardado"', async () => {
    mockSessionFetch(['t1'])
    render(
      <PortalSessionProvider>
        <TenantHeader tenant={tenant} avgRating={0} reviewCount={0} />
      </PortalSessionProvider>,
    )

    // SSR/primer render: arranca en "Guardar" (no-favorito) y tras hidratar pasa
    // a "Guardado" sin interacción del usuario.
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Guardado' })).toBeTruthy()
    })
    expect(
      screen.getByRole('button', { name: 'Guardado' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('sesión sin el tenant en favoritos → el botón queda en "Guardar"', async () => {
    mockSessionFetch(['otro-tenant'])
    render(
      <PortalSessionProvider>
        <TenantHeader tenant={tenant} avgRating={0} reviewCount={0} />
      </PortalSessionProvider>,
    )

    // Esperamos a que la hidratación termine (el fetch resuelve) antes de
    // afirmar que sigue en "Guardar".
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })
    const btn = screen.getByRole('button', { name: 'Guardar' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('sin provider (estado anónimo por default) el botón arranca en "Guardar"', () => {
    render(<TenantHeader tenant={tenant} avgRating={0} reviewCount={0} />)
    const btn = screen.getByRole('button', { name: 'Guardar' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })
})
