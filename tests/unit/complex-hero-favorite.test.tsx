// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import ComplexHero from '@/app/(public)/[slug]/components/ComplexHero'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import type { PortalSession } from '@/modules/players/portal-session'
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
  closesNextDay: false,
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

// El perfil del complejo es ISR: el server siempre renderiza "no favorito" y el estado real se
// hidrata desde GET /api/player/session (#40). El botón es solo ícono (44×44): su nombre es el
// aria-label, "Guardar en favoritos" / "Quitar de favoritos".
describe('ComplexHero favorito (#40)', () => {
  it('con el tenant entre los favoritos de la sesión, el botón hidrata a "Quitar de favoritos"', async () => {
    mockSessionFetch(['t1'])
    render(
      <PortalSessionProvider>
        <ComplexHero tenant={tenant} courtCount={0} formats={[]} avgRating={0} reviewCount={0} />
      </PortalSessionProvider>,
    )

    // SSR/primer render: arranca no-favorito y tras hidratar pasa a favorito sin interacción.
    expect(screen.getByRole('button', { name: 'Guardar en favoritos' })).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Quitar de favoritos' })).toBeTruthy()
    })
    expect(
      screen.getByRole('button', { name: 'Quitar de favoritos' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('guardado conserva su rojo en claro y en oscuro: el botón de la ficha no lo pisa con el neutro', async () => {
    mockSessionFetch(['t1'])
    render(
      <PortalSessionProvider>
        <ComplexHero tenant={tenant} courtCount={0} formats={[]} avgRating={0} reviewCount={0} />
      </PortalSessionProvider>,
    )
    const saved = await screen.findByRole('button', { name: 'Quitar de favoritos' })

    // Los colores del guardado (los arma el botón por tema) siguen en la clase final...
    expect(saved.classList.contains('text-red-700')).toBe(true)
    expect(saved.classList.contains('dark:text-red-400')).toBe(true)
    expect(saved.classList.contains('bg-red-500/10')).toBe(true)
    // ...y el neutro solo vale mientras NO está guardado (variante aria-pressed=false).
    expect(saved.classList.contains('text-foreground')).toBe(false)
    expect(saved.classList.contains('bg-transparent')).toBe(false)
    expect(saved.classList.contains('aria-[pressed=false]:text-foreground')).toBe(true)
  })

  it('sin guardar, Guardar y Compartir se ven iguales: borde y texto neutros', () => {
    render(
      <ComplexHero tenant={tenant} courtCount={0} formats={[]} avgRating={0} reviewCount={0} />,
    )
    const share = screen.getByRole('button', { name: 'Compartir' })

    expect(share.classList.contains('text-foreground')).toBe(true)
    expect(share.classList.contains('border-border')).toBe(true)
    expect(
      screen
        .getByRole('button', { name: 'Guardar en favoritos' })
        .classList.contains('aria-[pressed=false]:border-border'),
    ).toBe(true)
  })

  it('sesión sin el tenant → el botón queda en "Guardar en favoritos"', async () => {
    mockSessionFetch(['otro-tenant'])
    render(
      <PortalSessionProvider>
        <ComplexHero tenant={tenant} courtCount={0} formats={[]} avgRating={0} reviewCount={0} />
      </PortalSessionProvider>,
    )

    // Esperamos a que la hidratación termine (el fetch resuelve) antes de
    // afirmar que sigue sin guardar.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })
    const btn = screen.getByRole('button', { name: 'Guardar en favoritos' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('sin provider (estado anónimo por default) el botón arranca en "Guardar en favoritos"', () => {
    render(
      <ComplexHero tenant={tenant} courtCount={0} formats={[]} avgRating={0} reviewCount={0} />,
    )
    const btn = screen.getByRole('button', { name: 'Guardar en favoritos' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })
})
