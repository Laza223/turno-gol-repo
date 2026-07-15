// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StatusBanner } from '@/components/layout/status-banner'

afterEach(() => cleanup())

// Mediodía UTC: evita que el rollover de timezone local corra la fecha.
const PERIOD_END = '2026-09-13T12:00:00.000Z'

describe('StatusBanner — canceled (ENS-26)', () => {
  it('avisa que el acceso sigue hasta el fin del período y linkea a /reactivar', () => {
    render(
      <StatusBanner
        tenantStatus="canceled"
        trialEndsAt={null}
        periodEnd={PERIOD_END}
        serviceDegraded={false}
      />,
    )
    // El helper `formatDate` del archivo (compartido con la rama past_due) no
    // incluye el año — consistencia con el resto del banner, no un typo.
    expect(screen.getByText(/Cancelaste tu suscripción/)).toBeTruthy()
    expect(screen.getByText('13 de septiembre')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Reactivar/i })
    expect(link.getAttribute('href')).toBe('/reactivar')
  })

  it('sin periodEnd no rompe: no renderiza el banner de canceled', () => {
    render(
      <StatusBanner tenantStatus="canceled" trialEndsAt={null} periodEnd={null} serviceDegraded={false} />,
    )
    expect(screen.queryByText(/Cancelaste tu suscripción/)).toBeNull()
  })
})

describe('StatusBanner — ramas existentes (regresión)', () => {
  it('serviceDegraded gana con prioridad sobre cualquier estado', () => {
    render(
      <StatusBanner
        tenantStatus="canceled"
        trialEndsAt={null}
        periodEnd={PERIOD_END}
        serviceDegraded={true}
      />,
    )
    expect(screen.getByText(/problemas técnicos/)).toBeTruthy()
    expect(screen.queryByText(/Cancelaste tu suscripción/)).toBeNull()
  })

  it('trialing con trialEndsAt: muestra días restantes y "Elegir plan"', () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString()
    render(
      <StatusBanner tenantStatus="trialing" trialEndsAt={future} periodEnd={null} serviceDegraded={false} />,
    )
    expect(screen.getByRole('link', { name: 'Elegir plan' })).toBeTruthy()
  })

  it('past_due: avisa que el pago falló y linkea a /reactivar', () => {
    render(
      <StatusBanner tenantStatus="past_due" trialEndsAt={null} periodEnd={PERIOD_END} serviceDegraded={false} />,
    )
    const link = screen.getByRole('link', { name: 'Actualizar pago' })
    expect(link.getAttribute('href')).toBe('/reactivar')
  })

  it('suspended: avisa la suspensión sin fecha', () => {
    render(
      <StatusBanner tenantStatus="suspended" trialEndsAt={null} periodEnd={null} serviceDegraded={false} />,
    )
    expect(screen.getByText(/cuenta está suspendida/)).toBeTruthy()
  })

  it('active: no renderiza ningún banner', () => {
    const { container } = render(
      <StatusBanner tenantStatus="active" trialEndsAt={null} periodEnd={PERIOD_END} serviceDegraded={false} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
