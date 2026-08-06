// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { PlayerBottomNav } from '@/components/site/PlayerBottomNav'
import { AdminSidebar } from '@/components/layout/admin-sidebar'
import { AdminBottomNav } from '@/components/layout/admin-bottom-nav'

afterEach(cleanup)

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}))
import { usePathname } from 'next/navigation'

describe('PlayerBottomNav a11y', () => {
  it('nav has aria-label="Navegación del jugador"', () => {
    vi.mocked(usePathname).mockReturnValue('/mis-reservas')
    render(<PlayerBottomNav />)
    const nav = screen.getByRole('navigation', { name: /navegación del jugador/i })
    expect(nav).toBeTruthy()
  })

  it('active link has aria-current="page", inactive do not', () => {
    vi.mocked(usePathname).mockReturnValue('/mis-reservas')
    render(<PlayerBottomNav />)
    const active = screen.getByRole('link', { name: /reservas/i })
    expect(active.getAttribute('aria-current')).toBe('page')
    const inactive = screen.getByRole('link', { name: /explorar/i })
    expect(inactive.getAttribute('aria-current')).toBeNull()
  })
})

describe('AdminSidebar a11y', () => {
  it('nav has aria-label="Navegación del panel"', () => {
    vi.mocked(usePathname).mockReturnValue('/grilla')
    render(
      <AdminSidebar
        tenantName="Test Club"
        mobileOpen={false}
        onClose={() => {}}
      />,
    )
    // Two navs render (desktop + mobile) — both should have same aria-label
    const navs = screen.getAllByRole('navigation', { name: /navegación del panel/i })
    expect(navs.length).toBeGreaterThanOrEqual(1)
  })

  it('active link has aria-current="page"', () => {
    vi.mocked(usePathname).mockReturnValue('/grilla')
    render(
      <AdminSidebar
        tenantName="Test Club"
        mobileOpen={false}
        onClose={() => {}}
      />,
    )
    const activeLinks = screen.getAllByRole('link', { name: /grilla/i })
    // At least one of them (desktop or mobile) is active
    const hasCurrent = activeLinks.some((l) => l.getAttribute('aria-current') === 'page')
    expect(hasCurrent).toBe(true)
  })
})

/**
 * Fase 4: un espacio de la nav ya no es una ruta sino un conjunto de rutas.
 * Estos casos son el contrato de esa fusión — si alguien vuelve a deducir el
 * activo del prefijo del href, `/reservas` deja de encender Grilla en silencio.
 */
describe('AdminSidebar — los 6 espacios', () => {
  function renderSidebar(pathname: string, staffRole?: 'admin' | 'manager') {
    vi.mocked(usePathname).mockReturnValue(pathname)
    render(
      <AdminSidebar
        tenantName="Test Club"
        mobileOpen={false}
        onClose={() => {}}
        staffRole={staffRole}
      />,
    )
  }

  it('/reservas (pestaña Lista) enciende el espacio Grilla', () => {
    renderSidebar('/reservas')
    expect(screen.getAllByRole('link', { name: 'Grilla' })[0]!.getAttribute('aria-current')).toBe(
      'page',
    )
    // Y no hay ítem propio "Reservas" en el menú.
    expect(screen.queryByRole('link', { name: 'Reservas' })).toBeNull()
  })

  it('/abonados (pestaña Turnos fijos) enciende el espacio Clientes', () => {
    renderSidebar('/abonados')
    expect(screen.getAllByRole('link', { name: 'Clientes' })[0]!.getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.queryByRole('link', { name: 'Turnos fijos' })).toBeNull()
  })

  it('al manager Configuración se le bloquea con candado, no se le esconde', () => {
    renderSidebar('/grilla', 'manager')
    expect(screen.queryByRole('link', { name: 'Configuración' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Configuración' }).getAttribute('aria-disabled')).toBe(
      'true',
    )
  })

  it('al admin Configuración le queda como link navegable', () => {
    renderSidebar('/grilla', 'admin')
    expect(screen.getByRole('link', { name: 'Configuración' }).getAttribute('href')).toBe(
      '/settings',
    )
  })
})

describe('AdminBottomNav', () => {
  function renderBottomNav(pathname: string, staffRole: 'admin' | 'manager') {
    vi.mocked(usePathname).mockReturnValue(pathname)
    render(
      <AdminBottomNav onOpenMore={() => {}} moreOpen={false} staffRole={staffRole} />,
    )
  }

  it('el dueño ve Hoy · Grilla · Caja · Más', () => {
    renderBottomNav('/grilla', 'admin')
    expect(screen.getByRole('link', { name: 'Hoy' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Grilla' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Caja' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Más' })).toBeTruthy()
  })

  it('el encargado, sin Hoy, ve Grilla · Caja · Clientes · Más', () => {
    renderBottomNav('/grilla', 'manager')
    expect(screen.queryByRole('link', { name: 'Hoy' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Clientes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Más' })).toBeTruthy()
  })

  it('nunca ofrece más de 4 accesos (3 links + Más)', () => {
    renderBottomNav('/grilla', 'admin')
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })
})
