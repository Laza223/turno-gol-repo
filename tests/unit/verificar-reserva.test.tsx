// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Cruce #4 (auditoría cruzada junio): la página pública /reserva/[id]/verificar
// (QR del comprobante) no debe servir datos de reservas de tenants ocultos
// (suspended/blocked/canceled/churned/deleted, tenant-status.ts). Fail-closed:
// mismo mensaje genérico que un código inexistente, sin filtrar el motivo.

const execute = vi.fn()
vi.mock('@/shared/db/client', () => ({ getWorkerDb: () => ({ execute }) }))

import VerificarReservaPage from '@/app/reserva/[bookingId]/verificar/page'

const BOOKING_ID = '11111111-2222-4333-8444-555555555555'

function row(overrides: Record<string, string> = {}) {
  return {
    status: 'confirmed',
    date: '2026-06-15',
    timeStart: '20:00:00',
    timeEnd: '21:00:00',
    courtName: 'Cancha 1',
    tenantName: 'El Potrero',
    city: 'Rosario',
    tenantStatus: 'active',
    ...overrides,
  }
}

async function renderPage(bookingId: string = BOOKING_ID) {
  const ui = await VerificarReservaPage({ params: { bookingId } })
  return render(ui)
}

beforeEach(() => {
  execute.mockReset()
})
afterEach(() => cleanup())

describe('verificar reserva — tenants ocultos no sirven datos (cruce #4)', () => {
  it.each(['suspended', 'blocked', 'canceled', 'churned', 'deleted'])(
    'tenant %s → mensaje genérico sin datos del complejo',
    async (tenantStatus) => {
      execute.mockResolvedValue([row({ tenantStatus })])
      await renderPage()
      expect(screen.getByText('No pudimos verificar esta reserva')).toBeTruthy()
      expect(screen.queryByText(/El Potrero/)).toBeNull()
      expect(screen.queryByText(/Cancha 1/)).toBeNull()
      expect(screen.queryByText('Reserva confirmada')).toBeNull()
    },
  )

  it('tenant activo → muestra el veredicto y los datos del turno', async () => {
    execute.mockResolvedValue([row()])
    await renderPage()
    expect(screen.getByText('Reserva confirmada')).toBeTruthy()
    expect(screen.getByText(/El Potrero/)).toBeTruthy()
    expect(screen.getByText('Cancha 1')).toBeTruthy()
  })

  it('UUID inválido → mensaje genérico sin tocar la DB (sin 500)', async () => {
    await renderPage("'; DROP TABLE bookings; --")
    expect(screen.getByText('No pudimos verificar esta reserva')).toBeTruthy()
    expect(execute).not.toHaveBeenCalled()
  })

  it('error de DB → fail-closed con mensaje genérico', async () => {
    execute.mockRejectedValue(new Error('boom'))
    await renderPage()
    expect(screen.getByText('No pudimos verificar esta reserva')).toBeTruthy()
  })
})
