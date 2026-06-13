// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mockeamos la Server Action para no arrastrar el grafo de la action real.
vi.mock('@/app/(super-admin)/super-admin/tenants/[id]/actions', () => ({
  stopImpersonationAction: vi.fn(),
}))

import { ImpersonationBanner } from '@/components/layout/impersonation-banner'

describe('ImpersonationBanner', () => {
  it('muestra el nombre del tenant impersonado y el botón de salida', () => {
    render(<ImpersonationBanner tenantName="Complejo El Potrero" />)

    expect(
      screen.getByText(/Impersonando Complejo El Potrero/i),
    ).toBeDefined()
    expect(
      screen.getByRole('button', { name: /salir de impersonación/i }),
    ).toBeDefined()
  })

  it('es un alert (rol accesible) para que no pase desapercibido', () => {
    render(<ImpersonationBanner tenantName="Otro Complejo" />)
    expect(screen.getByRole('alert')).toBeDefined()
  })
})
