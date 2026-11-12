// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'

const state = {
  accountCreated: true,
  hasCourts: false,
  hasSchedule: false,
  hasStaffBookings: false,
  mpConnected: false,
  publicLinkShared: false,
  firstBookingReceived: false,
}

const props = {
  state,
  tenantSlug: 'x',
  appUrl: 'https://turnogol.app',
  action: vi.fn(async () => ({ success: true as const })),
  onDismiss: vi.fn(async () => ({ success: true as const })),
  staffRole: 'admin' as const,
}

/** Textos de los pasos pendientes, en el orden en que se ven. */
function pendingLabels(): string[] {
  return screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
}

function indexOfStep(labels: string[], fragment: string): number {
  return labels.findIndex((l) => l.includes(fragment))
}

afterEach(cleanup)

describe('OnboardingChecklist — orden y textos según el alta', () => {
  it('por defecto: pide cargar turnos en la grilla (link a /grilla), el link compartido va antes del objetivo', () => {
    render(<OnboardingChecklist {...props} />)
    const labels = pendingLabels()
    expect(screen.getByText('Cargá tus turnos en la grilla')).toBeTruthy()
    expect(screen.getByRole('link', { name: /cargar/i }).getAttribute('href')).toBe('/grilla')
    expect(indexOfStep(labels, 'Cargá tus turnos')).toBeLessThan(
      indexOfStep(labels, 'Link público compartido'),
    )
    expect(labels.at(-1)).toContain('Primera reserva online recibida')
    expect(screen.queryByText(/Datos del complejo/)).toBeNull()
  })

  it.each([
    ['cuaderno', { bookingIntake: 'notebook' as const }],
    ['equipos fijos', { hasFixedTeams: true }],
  ])('%s: pide pasar los equipos fijos y lleva a Turnos fijos', (_n, extra) => {
    render(<OnboardingChecklist {...props} {...extra} />)
    expect(screen.getByText('Pasá tus equipos fijos a la grilla')).toBeTruthy()
    expect(screen.queryByText('Cargá tus turnos en la grilla')).toBeNull()
    expect(screen.getByRole('link', { name: /cargar/i }).getAttribute('href')).toBe('/abonados')
  })

  it.each(['whatsapp', 'new'] as const)('%s: el link compartido va primero', (bookingIntake) => {
    render(<OnboardingChecklist {...props} bookingIntake={bookingIntake} />)
    const labels = pendingLabels()
    expect(labels[0]).toContain('Link público compartido')
    expect(labels.at(-1)).toContain('Primera reserva online recibida')
  })

  it('el encargado no cuenta los pasos de Configuración', () => {
    render(<OnboardingChecklist {...props} staffRole="manager" />)
    expect(screen.queryByText('Al menos una cancha configurada')).toBeNull()
    expect(screen.getByText('Cargá tus turnos en la grilla')).toBeTruthy()
  })
})
