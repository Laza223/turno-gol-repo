// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { PlayerBottomNav } from '@/app/(player)/_components/PlayerBottomNav'
import { AdminSidebar } from '@/components/layout/admin-sidebar'

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
    const inactive = screen.getByRole('link', { name: /perfil/i })
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
