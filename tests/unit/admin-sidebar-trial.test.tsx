// @vitest-environment happy-dom
//
// El período de prueba vive en el pie del riel, arriba de Ayuda (2026-09-24): ya no
// es una banda a lo ancho de cada pantalla. Al dueño lo lleva a Facturación; al
// encargado no le ofrece un link que lo rebota.
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AdminSidebar } from '@/components/layout/admin-sidebar'
import { StatusBanner } from '@/components/layout/status-banner'

vi.mock('next/navigation', () => ({ usePathname: vi.fn(() => '/dashboard') }))

afterEach(cleanup)

function renderSidebar(trialDaysLeft: number | null, staffRole: 'admin' | 'manager' = 'admin') {
  return render(
    <AdminSidebar
      tenantName="Complejo Fénix"
      mobileOpen={false}
      onClose={() => {}}
      userEmail="marcelo@test.com"
      onSignOut={() => {}}
      staffRole={staffRole}
      trialDaysLeft={trialDaysLeft}
    />,
  )
}

describe('AdminSidebar — período de prueba en el riel', () => {
  it('al dueño le muestra los días y lo lleva a elegir plan', () => {
    renderSidebar(73)
    // El cálculo del nombre mete un espacio entre los renglones y antes del texto
    // oculto ("73 días . Elegir plan"): el regex no depende de eso.
    const link = screen.getByRole('link', { name: /Prueba 73 días\W+Elegir plan/ })
    expect(link).toHaveAttribute('href', '/settings/facturacion')
  })

  it('singular: "1 día"', () => {
    renderSidebar(1)
    expect(screen.getByRole('link', { name: /Prueba 1 día\W+Elegir plan/ })).toBeVisible()
  })

  it('al encargado se lo muestra sin link (Facturación es del dueño)', () => {
    renderSidebar(73, 'manager')
    expect(screen.getByText('73 días')).toBeVisible()
    expect(screen.queryByRole('link', { name: /Elegir plan/ })).toBeNull()
  })

  it('fuera de la prueba no hay nada', () => {
    renderSidebar(null)
    expect(screen.queryByText(/Prueba/)).toBeNull()
  })
})

describe('StatusBanner — la prueba ya no es una banda', () => {
  it('trialing no pinta nada arriba de la pantalla', () => {
    const { container } = render(
      <StatusBanner tenantStatus="trialing" periodEnd={null} serviceDegraded={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
