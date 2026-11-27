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
        periodEnd={PERIOD_END}
        serviceDegraded={false}
        staffRole="admin"
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
      <StatusBanner
        tenantStatus="canceled"
        periodEnd={null}
        serviceDegraded={false}
        staffRole="admin"
      />,
    )
    expect(screen.queryByText(/Cancelaste tu suscripción/)).toBeNull()
  })
})

describe('StatusBanner — ramas existentes (regresión)', () => {
  it('serviceDegraded gana con prioridad sobre cualquier estado', () => {
    render(
      <StatusBanner
        tenantStatus="canceled"
        periodEnd={PERIOD_END}
        serviceDegraded={true}
        staffRole="admin"
      />,
    )
    expect(screen.getByText(/problema técnico/)).toBeTruthy()
    expect(screen.queryByText(/Cancelaste tu suscripción/)).toBeNull()
  })

  it('past_due: avisa que el pago falló y linkea a /reactivar', () => {
    render(
      <StatusBanner
        tenantStatus="past_due"
        periodEnd={PERIOD_END}
        serviceDegraded={false}
        staffRole="admin"
      />,
    )
    const link = screen.getByRole('link', { name: 'Actualizar pago' })
    expect(link.getAttribute('href')).toBe('/reactivar')
  })

  it('suspended: avisa la suspensión sin fecha', () => {
    render(<StatusBanner tenantStatus="suspended" periodEnd={null} serviceDegraded={false} />)
    expect(screen.getByText(/cuenta está pausada/)).toBeTruthy()
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
    expect(screen.getByRole('status').textContent).toMatch(/pausada por falta de pago/)
    expect(screen.getByRole('status').textContent).not.toMatch(/Tenés hasta/)
    expect(screen.getByRole('link', { name: 'Actualizar pago' })).toBeTruthy()
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

// Fin del freemium (2026-11-27): banda fija de `trial_expired` (y su alias `free`).
describe('StatusBanner — trial_expired', () => {
  it.each(['trial_expired', 'free'])(
    '%s sin haber pagado nunca: dice que terminó la prueba y ofrece activar el plan al dueño',
    (status) => {
      render(
        <StatusBanner
          tenantStatus={status}
          periodEnd={null}
          serviceDegraded={false}
          staffRole="admin"
        />,
      )
      expect(screen.getByRole('status').textContent).toMatch(/Terminó tu prueba de \d+ días/)
      expect(screen.getByRole('status').textContent).toMatch(/turnos confirmados siguen/)
      expect(screen.getByRole('link', { name: 'Activar plan' }).getAttribute('href')).toBe(
        '/reactivar',
      )
    },
  )

  it('si pagó alguna vez: dice que el plan no está activo', () => {
    render(
      <StatusBanner
        tenantStatus="trial_expired"
        periodEnd={null}
        serviceDegraded={false}
        staffRole="admin"
        expired={{ everPaid: true }}
      />,
    )
    expect(screen.getByRole('status').textContent).toMatch(/Tu plan no está activo/)
    expect(screen.getByRole('status').textContent).not.toMatch(/Terminó tu prueba/)
  })

  it('el encargado no ve el botón: lee a quién avisarle', () => {
    render(
      <StatusBanner
        tenantStatus="trial_expired"
        periodEnd={null}
        serviceDegraded={false}
        staffRole="manager"
      />,
    )
    expect(screen.getByRole('status').textContent).toMatch(/Avisale al dueño del complejo/)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
