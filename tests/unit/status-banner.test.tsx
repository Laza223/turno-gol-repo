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

// Decisión 2026-10-22: `suspended` es solo lectura. El aviso distingue la
// prueba vencida de la mora, muestra la fecha de corte de la prueba y solo el
// dueño ve el botón (`/reactivar` es solo suyo).
describe('StatusBanner — solo lectura (suspended)', () => {
  // 03:00 UTC = medianoche ART: en UTC ya es el 20, en ART también.
  const TRIAL_UNTIL = '2026-12-20T03:00:00.000Z'

  it('prueba vencida, dueño: dice que la prueba terminó, la fecha de corte y "Activar plan"', () => {
    render(
      <StatusBanner
        tenantStatus="suspended"
        periodEnd={null}
        serviceDegraded={false}
        readOnly={{ origin: 'trial', until: TRIAL_UNTIL }}
        staffRole="admin"
      />,
    )
    expect(screen.getByRole('status').textContent).toMatch(/Tu prueba terminó/)
    expect(screen.getByRole('status').textContent).toMatch(/solo lectura/)
    expect(screen.getByText('20 de diciembre')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Activar plan' })
    expect(link.getAttribute('href')).toBe('/reactivar')
    expect(screen.queryByText(/Avisale al dueño/)).toBeNull()
  })

  it('prueba vencida, encargado: sin botón, le dice que le avise al dueño', () => {
    render(
      <StatusBanner
        tenantStatus="suspended"
        periodEnd={null}
        serviceDegraded={false}
        readOnly={{ origin: 'trial', until: TRIAL_UNTIL }}
        staffRole="manager"
      />,
    )
    expect(screen.getByRole('status').textContent).toMatch(/Avisale al dueño del complejo/)
    expect(screen.queryByRole('link')).toBeNull()
  })

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
        readOnly={{ origin: 'trial', until: '2026-12-21T02:00:00.000Z' }}
        staffRole="admin"
      />,
    )
    expect(screen.getByText('20 de diciembre')).toBeTruthy()
  })
})
