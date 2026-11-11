// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StatusBanner } from '@/components/layout/status-banner'

afterEach(() => cleanup())

// Mediodía UTC: evita que el rollover de timezone local corra la fecha.
const PERIOD_END = '2026-09-13T12:00:00.000Z'

describe('StatusBanner — canceled (ENS-26)', () => {
  it('avisa que el acceso sigue hasta el fin del período y linkea a /reactivar', () => {
    render(<StatusBanner tenantStatus="canceled" periodEnd={PERIOD_END} serviceDegraded={false} />)
    // El helper `formatDate` del archivo (compartido con la rama past_due) no
    // incluye el año — consistencia con el resto del banner, no un typo.
    expect(screen.getByText(/Cancelaste tu suscripción/)).toBeTruthy()
    expect(screen.getByText('13 de septiembre')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Reactivar/i })
    expect(link.getAttribute('href')).toBe('/reactivar')
  })

  it('sin periodEnd no rompe: no renderiza el banner de canceled', () => {
    render(<StatusBanner tenantStatus="canceled" periodEnd={null} serviceDegraded={false} />)
    expect(screen.queryByText(/Cancelaste tu suscripción/)).toBeNull()
  })
})

describe('StatusBanner — ramas existentes (regresión)', () => {
  it('serviceDegraded gana con prioridad sobre cualquier estado', () => {
    render(<StatusBanner tenantStatus="canceled" periodEnd={PERIOD_END} serviceDegraded={true} />)
    expect(screen.getByText(/problemas técnicos/)).toBeTruthy()
    expect(screen.queryByText(/Cancelaste tu suscripción/)).toBeNull()
  })

  it('past_due: avisa que el pago falló y linkea a /reactivar', () => {
    render(<StatusBanner tenantStatus="past_due" periodEnd={PERIOD_END} serviceDegraded={false} />)
    const link = screen.getByRole('link', { name: 'Actualizar pago' })
    expect(link.getAttribute('href')).toBe('/reactivar')
  })

  it('suspended: avisa la suspensión sin fecha', () => {
    render(<StatusBanner tenantStatus="suspended" periodEnd={null} serviceDegraded={false} />)
    expect(screen.getByText(/cuenta está suspendida/)).toBeTruthy()
  })

  it('active: no renderiza ningún banner', () => {
    const { container } = render(
      <StatusBanner tenantStatus="active" periodEnd={PERIOD_END} serviceDegraded={false} />,
    )
    expect(container.firstChild).toBeNull()
  })
})

// `suspended` es solo lectura (decisión 2026-10-22). Desde el freemium es solo
// la mora: la prueba vencida baja al plan gratis. Solo el dueño ve el botón.
describe('StatusBanner — solo lectura (suspended)', () => {
  it('mora, dueño: habla de la falta de pago, sin fecha, con "Regularizar pago"', () => {
    render(
      <StatusBanner
        tenantStatus="suspended"
        periodEnd={null}
        serviceDegraded={false}
        readOnly={{ origin: 'dunning', until: null }}
        staffRole="admin"
      />,
    )
    expect(screen.getByRole('status').textContent).toMatch(/suspendida por falta de pago/)
    expect(screen.getByRole('status').textContent).not.toMatch(/Tenés hasta/)
    expect(screen.getByRole('link', { name: 'Regularizar pago' })).toBeTruthy()
  })

  it('la fecha de corte sale en hora argentina aunque en UTC ya sea el día siguiente', () => {
    // 02:00 UTC del 21 = 23:00 ART del 20.
    render(
      <StatusBanner
        tenantStatus="suspended"
        periodEnd={null}
        serviceDegraded={false}
        readOnly={{ origin: 'dunning', until: '2026-12-21T02:00:00.000Z' }}
        staffRole="admin"
      />,
    )
    expect(screen.getByText('20 de diciembre')).toBeTruthy()
  })
})

// Plan gratis (freemium, 2026-11-08): banda informativa, con el tope del mes y
// la pausa por cancelaciones. En gratis solo entra el dueño.
describe('StatusBanner — plan gratis', () => {
  it('sin tope ni pausa: cuenta qué es el gratis y ofrece pasar al plan', () => {
    render(<StatusBanner tenantStatus="free" periodEnd={null} serviceDegraded={false} />)
    expect(screen.getByRole('status').textContent).toMatch(/Estás en el plan gratis/)
    expect(screen.getByRole('link', { name: 'Pasar al plan' }).getAttribute('href')).toBe(
      '/reactivar',
    )
  })

  it('con el tope del mes: dice que los jugadores ya reservaron 20 turnos', () => {
    render(
      <StatusBanner
        tenantStatus="free"
        periodEnd={null}
        serviceDegraded={false}
        freePlan={{ capReached: true, paused: false }}
      />,
    )
    expect(screen.getByRole('status').textContent).toMatch(/ya te reservaron 20 turnos online/)
  })

  it('en pausa: pide marcar los ocupados y muestra el botón para reanudar', () => {
    render(
      <StatusBanner
        tenantStatus="free"
        periodEnd={null}
        serviceDegraded={false}
        freePlan={{ capReached: true, paused: true }}
        resumeOnlineAction={async () => ({ success: true })}
      />,
    )
    expect(screen.getByRole('status').textContent).toMatch(/Pausamos tus reservas online/)
    expect(screen.getByRole('button', { name: 'Ya marqué mis ocupados' })).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
