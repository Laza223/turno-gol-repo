// @vitest-environment happy-dom
//
// Punto rojo del menú del panel cuando falta completar algo (fotos de canchas,
// portada/logo/ubicación del perfil). Se apaga solo: sin faltantes no hay punto.
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { AdminSidebar } from '@/components/layout/admin-sidebar'
import { AdminBottomNav } from '@/components/layout/admin-bottom-nav'
import { NO_SETUP_ALERTS } from '@/components/layout/setup-alerts'

vi.mock('next/navigation', () => ({ usePathname: vi.fn(() => '/grilla') }))

afterEach(cleanup)

const ALERT = /hay algo por completar/

function renderSidebar(
  setupAlerts: { courts: number; profile: number },
  staffRole: 'admin' | 'manager' = 'admin',
) {
  return render(
    <AdminSidebar
      tenantName="Complejo Fénix"
      mobileOpen={false}
      onClose={() => {}}
      userEmail="marcelo@test.com"
      onSignOut={() => {}}
      staffRole={staffRole}
      setupAlerts={setupAlerts}
    />,
  )
}

describe('AdminSidebar — punto rojo', () => {
  it('canchas sin foto: solo Canchas lleva el punto', () => {
    renderSidebar({ courts: 2, profile: 0 })
    const rail = screen.getByRole('navigation', { name: /navegación del panel/i })

    expect(
      within(rail).getByRole('link', { name: /Canchas.*hay algo por completar/ }),
    ).toBeVisible()
    expect(within(rail).getByRole('link', { name: 'Grilla' })).toBeVisible()
    expect(screen.queryByRole('link', { name: /Configuración.*por completar/ })).toBeNull()
  })

  it('perfil incompleto: Ajustes lo anuncia por su nombre accesible', () => {
    renderSidebar({ courts: 0, profile: 3 })

    expect(screen.getByRole('link', { name: `Ajustes — hay algo por completar` })).toBeVisible()
    expect(screen.queryByRole('link', { name: /Canchas.*por completar/ })).toBeNull()
  })

  it('todo completo: ningún punto', () => {
    renderSidebar(NO_SETUP_ALERTS)

    expect(screen.queryByText(ALERT)).toBeNull()
  })

  it('sin la prop (stories, loading) no muestra nada', () => {
    render(
      <AdminSidebar
        tenantName="Complejo Fénix"
        mobileOpen={false}
        onClose={() => {}}
        userEmail="marcelo@test.com"
        onSignOut={() => {}}
        staffRole="admin"
      />,
    )

    expect(screen.queryByText(ALERT)).toBeNull()
  })

  it('el encargado no ve Canchas ni Configuración: no hay punto aunque el número sea > 0', () => {
    renderSidebar({ courts: 2, profile: 3 }, 'manager')

    expect(screen.queryByText(ALERT)).toBeNull()
  })
})

describe('AdminBottomNav — punto rojo en "Más"', () => {
  it('con faltantes, el punto sube a "Más" (Canchas y Ajustes quedan detrás)', () => {
    render(
      <AdminBottomNav
        onOpenMore={() => {}}
        moreOpen={false}
        staffRole="admin"
        setupAlerts={{ courts: 1, profile: 0 }}
      />,
    )

    expect(screen.getByRole('button', { name: /Más.*hay algo por completar/ })).toBeVisible()
  })

  it('solo el perfil incompleto también lo prende (Configuración vive detrás de "Más")', () => {
    render(
      <AdminBottomNav
        onOpenMore={() => {}}
        moreOpen={false}
        staffRole="admin"
        setupAlerts={{ courts: 0, profile: 1 }}
      />,
    )

    expect(screen.getByRole('button', { name: /Más.*hay algo por completar/ })).toBeVisible()
  })

  it('todo completo: "Más" queda como siempre', () => {
    render(
      <AdminBottomNav
        onOpenMore={() => {}}
        moreOpen={false}
        staffRole="admin"
        setupAlerts={NO_SETUP_ALERTS}
      />,
    )

    expect(screen.getByRole('button', { name: 'Más' })).toBeVisible()
  })

  it('el encargado no lo ve: no puede completar nada de eso', () => {
    render(
      <AdminBottomNav
        onOpenMore={() => {}}
        moreOpen={false}
        staffRole="manager"
        setupAlerts={{ courts: 4, profile: 3 }}
      />,
    )

    expect(screen.getByRole('button', { name: 'Más' })).toBeVisible()
  })
})
