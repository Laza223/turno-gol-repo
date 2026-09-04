// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, never>)} />
  },
}))

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

import BusinessHeader from '@/components/site/BusinessHeader'
import PortalHeader from '@/components/site/PortalHeader'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import type { PortalSession } from '@/modules/players/portal-session'

afterEach(() => cleanup())

const PLAYER: PortalSession = {
  playerId: 'p1',
  firstName: 'Tomás',
  lastName: 'Gómez',
  avatarUrl: null,
  email: 'tomas@test.com',
}

function withSession(
  children: ReactNode,
  value: { session: PortalSession | null; staffPanelPath: string | null },
) {
  return (
    <PortalSessionProvider
      initialValue={{
        session: value.session,
        favoriteTenantIds: new Set(),
        staffPanelPath: value.staffPanelPath,
      }}
    >
      {children}
    </PortalSessionProvider>
  )
}

/**
 * El acceso "Ir a mi panel" para un complejo que YA tiene la sesión abierta y
 * cae en una página pública. Antes veía "Ingresar", entraba, y el login lo
 * devolvía al mismo lugar.
 *
 * El caso sin sesión de complejo es tan importante como el otro: tiene que
 * renderizar IDÉNTICO a como venía, porque es lo que protege las capturas de
 * referencia de la portada y de las páginas comerciales.
 */
describe('BusinessHeader — acceso al panel', () => {
  it('con sesión de complejo, reemplaza Ingresar por Ir a mi panel', () => {
    render(withSession(<BusinessHeader />, { session: null, staffPanelPath: '/dashboard' }))
    expect(screen.getAllByRole('link', { name: 'Ir a mi panel' })[0].getAttribute('href')).toBe(
      '/dashboard',
    )
    expect(screen.queryByRole('link', { name: 'Ingresar' })).toBeNull()
  })

  it('respeta el destino cuando el complejo todavía no eligió cuál', () => {
    render(withSession(<BusinessHeader />, { session: null, staffPanelPath: '/select-tenant' }))
    expect(screen.getAllByRole('link', { name: 'Ir a mi panel' })[0].getAttribute('href')).toBe(
      '/select-tenant',
    )
  })

  it('sin sesión de complejo queda igual que antes: Ingresar → /login', () => {
    render(withSession(<BusinessHeader />, { session: null, staffPanelPath: null }))
    expect(screen.getAllByRole('link', { name: 'Ingresar' })[0].getAttribute('href')).toBe('/login')
    expect(screen.queryByRole('link', { name: 'Ir a mi panel' })).toBeNull()
  })

  it('el CTA comercial se conserva siempre', () => {
    render(withSession(<BusinessHeader />, { session: null, staffPanelPath: '/dashboard' }))
    expect(screen.getByRole('link', { name: /empezar gratis/i }).getAttribute('href')).toBe(
      '/register',
    )
  })
})

describe('PortalHeader — acceso al panel', () => {
  const signOutAction = vi.fn(async () => {})

  it.each(['overlay', 'solid'] as const)(
    'variante %s: con sesión de complejo muestra Ir a mi panel',
    (variant) => {
      render(
        withSession(<PortalHeader variant={variant} signOutAction={signOutAction} />, {
          session: null,
          staffPanelPath: '/dashboard',
        }),
      )
      expect(screen.getByRole('link', { name: 'Ir a mi panel' }).getAttribute('href')).toBe(
        '/dashboard',
      )
      expect(screen.queryByRole('link', { name: 'Ingresar' })).toBeNull()
    },
  )

  it.each(['overlay', 'solid'] as const)(
    'variante %s: sin sesión queda igual que antes, Ingresar → /ingresar',
    (variant) => {
      render(
        withSession(<PortalHeader variant={variant} signOutAction={signOutAction} />, {
          session: null,
          staffPanelPath: null,
        }),
      )
      expect(screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toBe('/ingresar')
      expect(screen.queryByRole('link', { name: 'Ir a mi panel' })).toBeNull()
    },
  )

  it('el jugador gana sobre el complejo: se muestra su menú de cuenta', () => {
    render(
      withSession(<PortalHeader variant="overlay" signOutAction={signOutAction} />, {
        session: PLAYER,
        staffPanelPath: '/dashboard',
      }),
    )
    expect(screen.getByRole('button', { name: /cuenta de tom/i })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Ir a mi panel' })).toBeNull()
  })
})
