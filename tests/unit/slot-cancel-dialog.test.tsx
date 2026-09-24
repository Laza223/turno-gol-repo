// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

import { SlotCancelDialog } from '@/components/booking/slot-panel/SlotCancelDialog'
import { getRefundOutcome } from '@/modules/bookings/refund-outcome'
import { booking, toGridBooking } from '@/test/fixtures/booking'
import type { GridBooking } from '@/lib/booking/grid-cells'

afterEach(() => cleanup())

const HOUR = 3_600_000
// Turno hoy: dentro de 20h desde "ahora" (NOW_MS), política de 12h.
const NOW_MS = Date.UTC(2026, 6, 20, 12, 0, 0)
const START_MS = NOW_MS + 20 * HOUR
const END_MS = START_MS + HOUR

function bookingFixture(overrides: Partial<GridBooking> = {}): GridBooking {
  return {
    ...toGridBooking(booking()),
    startsAtMs: START_MS,
    endsAtMs: END_MS,
    ...overrides,
  }
}

const noopCancel = vi.fn(async () => ({ success: true as const, booking: {} as never }))

function renderDialog(props: {
  gridBooking?: GridBooking
  hasEnded?: boolean
  cancellationPolicyHours?: number | null
  nowMs?: number
}) {
  const {
    gridBooking = bookingFixture(),
    hasEnded = false,
    cancellationPolicyHours = 12,
    nowMs = NOW_MS,
  } = props
  return render(
    <SlotCancelDialog
      open
      onOpenChange={() => {}}
      booking={gridBooking}
      label="Juan Pérez"
      hasEnded={hasEnded}
      computeRefundOutcome={(cancellationType) =>
        gridBooking.startsAtMs != null &&
        gridBooking.endsAtMs != null &&
        cancellationPolicyHours != null
          ? getRefundOutcome({
              depositStatus: gridBooking.depositStatus ?? 'not_required',
              depositAmountCents: gridBooking.depositAmount ?? 0,
              paymentMethod: gridBooking.paymentMethod ?? null,
              bookingStartUtcMs: gridBooking.startsAtMs,
              bookingEndUtcMs: gridBooking.endsAtMs,
              policyHours: cancellationPolicyHours,
              nowMs,
              cancellationType,
            })
          : null
      }
      cancelAction={noopCancel}
      onCancelled={() => {}}
    />,
  )
}

/**
 * ENS-2 / decisión del dueño 2026-09-24: mismo aviso de seña que
 * BookingActions.tsx, ahora también en la Grilla/Hoy (`getRefundOutcome`
 * inyectado — un componente reusable no puede importar el dominio como valor).
 */
describe('SlotCancelDialog — aviso de seña (getRefundOutcome inyectado)', () => {
  it('sin elegir quién cancela, dentro de plazo: muestra los dos resultados con monto', () => {
    renderDialog({})
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Si cancela el jugador: la seña de $ 4.500 queda para devolver (dentro del plazo de 12h). Si cancela el complejo: la seña de $ 4.500 queda para devolver.',
    )
  })

  it('sin elegir quién cancela, fuera de plazo: el resultado difiere según quién cancele', () => {
    // Turno en 6h, política de 12h → ya fuera del plazo.
    const gridBooking = bookingFixture({
      startsAtMs: NOW_MS + 6 * HOUR,
      endsAtMs: NOW_MS + 7 * HOUR,
    })
    renderDialog({ gridBooking })
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Si cancela el jugador: la seña de $ 4.500 queda para el complejo (fuera del plazo de 12h). Si cancela el complejo: la seña de $ 4.500 queda para devolver.',
    )
  })

  it('jugador fuera de plazo: retención con monto', () => {
    const gridBooking = bookingFixture({
      startsAtMs: NOW_MS + 6 * HOUR,
      endsAtMs: NOW_MS + 7 * HOUR,
    })
    renderDialog({ gridBooking })
    fireEvent.click(screen.getByRole('radio', { name: /El jugador pidió cancelar/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Fuera del plazo de cancelación (12h): la seña de $ 4.500 queda para el complejo (sin reembolso).',
    )
  })

  it('complejo, canal mercadopago: pide devolver desde MercadoPago', () => {
    renderDialog({})
    fireEvent.click(screen.getByRole('radio', { name: /El complejo necesita cancelar/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'La seña de $ 4.500 queda para devolver: hacelo vos desde tu MercadoPago (no es automático) — si la devolvés ahí, el sistema la marca sola.',
    )
  })

  it('turno ya terminado: nunca promete reembolso, ni si el complejo cancela', () => {
    const gridBooking = bookingFixture({
      startsAtMs: NOW_MS - 2 * HOUR,
      endsAtMs: NOW_MS - HOUR,
    })
    renderDialog({ gridBooking, hasEnded: true })
    fireEvent.click(screen.getByRole('radio', { name: /El complejo necesita cancelar/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'El turno ya se jugó: la seña de $ 4.500 queda para el complejo (sin reembolso).',
    )
    expect(screen.getByRole('dialog')).not.toHaveTextContent('queda para devolver')
  })

  it('sin startsAtMs/endsAtMs (degradado): usa el texto genérico, no inventa un plazo', () => {
    const gridBooking = bookingFixture({ startsAtMs: undefined, endsAtMs: undefined })
    renderDialog({ gridBooking, hasEnded: false })
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Hay una seña de $ 4.500 pagada: el reembolso depende de quién cancela (elegí una opción abajo).',
    )
  })

  it('sin seña pagada: avisa que no hay nada que devolver', () => {
    const gridBooking = bookingFixture({ depositStatus: 'not_required', depositAmount: 0 })
    renderDialog({ gridBooking })
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Esta reserva no tiene seña pagada. Solo se libera el turno.',
    )
  })
})
