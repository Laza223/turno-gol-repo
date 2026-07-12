// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImpersonationBanner } from '@/components/layout/impersonation-banner'

// La Server Action entra por PROP (ver el comentario en impersonation-banner.tsx):
// ya no hace falta mockear el módulo real para evitar arrastrar drizzle.
describe('ImpersonationBanner', () => {
  it('muestra el nombre del tenant impersonado y el botón de salida', () => {
    render(<ImpersonationBanner tenantName="Complejo El Potrero" action={vi.fn()} />)

    expect(
      screen.getByText(/Impersonando Complejo El Potrero/i),
    ).toBeDefined()
    expect(
      screen.getByRole('button', { name: /salir de impersonación/i }),
    ).toBeDefined()
  })

  it('es un alert (rol accesible) para que no pase desapercibido', () => {
    render(<ImpersonationBanner tenantName="Otro Complejo" action={vi.fn()} />)
    expect(screen.getByRole('alert')).toBeDefined()
  })
})
