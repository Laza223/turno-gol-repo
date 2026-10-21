// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const nav = vi.hoisted(() => ({ pathname: '/explorar' }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}))

import PortalFrame from '@/components/site/PortalFrame'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import type { PortalSession } from '@/modules/players/portal-session'

afterEach(() => {
  cleanup()
  nav.pathname = '/explorar'
})

const PLAYER: PortalSession = {
  playerId: 'p1',
  firstName: 'Tomás',
  lastName: 'Gómez',
  avatarUrl: null,
  email: 'tomas@test.com',
}

function frame(session: PortalSession | null, staffPanelPath: string | null = null) {
  return render(
    <PortalSessionProvider initialValue={{ session, favoriteTenantIds: new Set(), staffPanelPath }}>
      <PortalFrame header={<header>h</header>} footer={<footer>f</footer>}>
        <p>contenido</p>
      </PortalFrame>
    </PortalSessionProvider>,
  )
}

/**
 * La barra inferior del celular (Explorar · Reservas · Cuenta) va SIEMPRE, también sin sesión
 * (decisión 2026-10-20, `docs/decisions/2026-10-20-vuelve-la-previa.md`). Sin sesión, Reservas y
 * Cuenta redirigen a /ingresar?next=… por el guard de cada página.
 */
describe('PortalFrame — barra inferior', () => {
  it.each([
    ['sin sesión', null],
    ['con sesión', PLAYER],
  ])('%s: renderiza la barra con sus tres destinos', (_label, session) => {
    frame(session)
    const nav = screen.getByRole('navigation', { name: 'Navegación del jugador' })
    expect(nav).toBeTruthy()
    const hrefs = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/explorar', '/mis-reservas', '/configuracion'])
    expect(screen.getByRole('link', { name: 'Explorar' }).getAttribute('aria-current')).toBe('page')
  })

  it('reserva el alto de la barra aunque no haya sesión', () => {
    const { container } = frame(null)
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'pb-[calc(3.5rem+1px+env(safe-area-inset-bottom))]',
    )
  })

  it('con sesión de complejo (staffPanelPath) no hay barra ni relleno', () => {
    const { container } = frame(null, '/dashboard')
    expect(screen.queryByRole('navigation', { name: 'Navegación del jugador' })).toBeNull()
    expect((container.firstElementChild as HTMLElement).className).not.toContain('pb-[calc')
  })

  it.each(['/suspended', '/reactivar'])('en %s no hay barra ni relleno', (pathname) => {
    nav.pathname = pathname
    const { container } = frame(null)
    expect(screen.queryByRole('navigation', { name: 'Navegación del jugador' })).toBeNull()
    expect((container.firstElementChild as HTMLElement).className).not.toContain('pb-[calc')
  })
})
