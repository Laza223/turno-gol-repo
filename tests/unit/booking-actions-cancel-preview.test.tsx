// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

import BookingActions from '@/app/(admin)/reservas/[id]/BookingActions'

const noop = vi.fn(async () => ({ success: true as const, booking: {} as never }))

// Mismo reloj congelado que BookingActions.stories.tsx: sáb 14-mar-2026,
// 15:30 ART. Turno hoy 20:00 con política de 12h → ventana (11:00) ya pasó:
// "fuera de plazo". Turno en 2 días 20:00 → todavía "dentro de plazo".
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-14T15:30:00-03:00'))
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

function renderActions(overrides: Partial<Parameters<typeof BookingActions>[0]> = {}) {
  return render(
    <BookingActions
      bookingId="booking-1"
      status="confirmed"
      depositStatus="paid"
      depositAmount={450_000}
      paymentMethod="mercadopago"
      bookingDate="2026-03-14"
      timeStart="20:00:00"
      cancellationPolicyHours={12}
      priceSnapshot={1500000}
      chargesTotal={0}
      guestName={null}
      guestPhone={null}
      completeAndChargeBookingAction={noop}
      markNoShowAction={noop}
      revertNoShowAction={noop}
      cancelBookingAction={noop}
      {...overrides}
    />,
  )
}

/**
 * ENS-2: el modal admin decía la consecuencia de cancelar recién DESPUÉS de
 * elegir "quién cancela" — antes de eso no había info. Ahora el preview de la
 * seña es visible apenas se abre el diálogo, con la política real.
 */
describe('BookingActions — preview de seña visible antes de elegir "quién cancela" (ENS-2)', () => {
  it('sin elegir quién cancela, dentro de la ventana: muestra los dos resultados, ambos "queda para devolver"', () => {
    renderActions({ bookingDate: '2026-03-16' }) // +2 días → dentro del plazo de 12h
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Si cancela el jugador: la seña de $ 4.500 queda para devolver (dentro del plazo de 12h). Si cancela el complejo: la seña de $ 4.500 queda para devolver.',
    )
  })

  it('sin elegir quién cancela, fuera de la ventana: el resultado difiere según quién cancele', () => {
    renderActions() // hoy 20:00, ventana de 12h ya cerrada a las 15:30
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Si cancela el jugador: la seña de $ 4.500 queda para el complejo (fuera del plazo de 12h). Si cancela el complejo: la seña de $ 4.500 queda para devolver.',
    )
  })

  it('sin seña pagada: avisa que no hay nada que devolver, sin elegir nada', () => {
    renderActions({ depositStatus: 'not_required', depositAmount: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Esta reserva no tiene seña pagada. Solo se libera el turno.',
    )
  })

  it('elegir "El complejo necesita cancelar" sigue reembolsando siempre (no regresiona)', () => {
    renderActions() // fuera de plazo normal, pero "complejo" reembolsa igual
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('radio', { name: /El complejo necesita cancelar/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'La seña de $ 4.500 queda para devolver: hacelo vos desde tu MercadoPago (no es automático) — si la devolvés ahí, el sistema la marca sola.',
    )
  })
})

/**
 * R3-1: `bookingStartMs(dateStr, hhmmss)` reconstruía el instante con offset
 * fijo -3 (ART) a partir de `bookingDate`/`timeStart` — ignoraba que en
 * complejos `closes_next_day` un slot de madrugada guarda `date` = día
 * OPERATIVO (la noche anterior), no el día calendario real. `starts_at`
 * (TIMESTAMPTZ, instante físico absoluto — migraciones 040/041) es la fuente
 * de verdad; cuando llega, tiene que ganarle al cálculo manual.
 */
describe('BookingActions — preview de plazo usa starts_at físico cuando está disponible (R3-1)', () => {
  it('closes_next_day madrugada: con starts_at real el preview da "dentro de plazo" donde el cálculo naive daba "fuera de plazo"', () => {
    // Reloj congelado (ver beforeEach): 2026-03-14T15:30:00-03:00 = 2026-03-14T18:30:00Z.
    // bookingDate/timeStart son el día OPERATIVO (noche del 13→14) y la hora de
    // pared de un slot de madrugada — el cálculo naive los toma como si fueran
    // el día calendario 14 a las 01:00 ART, que ya pasó hace rato.
    // El instante físico real es la madrugada del 15 (01:00 ART del día
    // siguiente) = 2026-03-15T04:00:00.000Z, todavía a 9.5hs de "ahora" — con
    // una política de 6hs, sigue DENTRO de la ventana de devolución.
    renderActions({
      bookingDate: '2026-03-14',
      timeStart: '01:00:00',
      cancellationPolicyHours: 6,
      startsAt: '2026-03-15T04:00:00.000Z',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Si cancela el jugador: la seña de $ 4.500 queda para devolver (dentro del plazo de 6h). Si cancela el complejo: la seña de $ 4.500 queda para devolver.',
    )
  })

  it('sin starts_at (null), cae al cálculo manual: da "01:00 ART del 14" — ya pasado, turno_ended (clase B3, no motivo equivocado)', () => {
    renderActions({
      bookingDate: '2026-03-14',
      timeStart: '01:00:00',
      cancellationPolicyHours: 6,
      startsAt: null,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'El turno ya se jugó: la seña de $ 4.500 queda para el complejo (sin reembolso).',
    )
  })
})

/**
 * Clase de B3: `decideAdminRefund` (backend, booking.cancellation.ts) NUNCA
 * reembolsa un turno YA TERMINADO (`ends_at` físico ya pasó), ni para
 * 'complejo'. Antes de este fix, `willRefund` acá era
 * `cancelType === 'complejo' ? true : inPolicy` sin el guard: la UI le
 * prometía al admin un reembolso ("queda para devolver…") que el backend ya
 * no iba a ejecutar.
 */
describe('BookingActions — turno ya terminado nunca promete reembolso (clase B3)', () => {
  it('turno YA TERMINADO + complejo: el preview dice "sin reembolso", no "queda para devolver"', () => {
    const past = new Date(Date.now() - 3_600_000).toISOString()
    renderActions({
      startsAt: past,
      endsAt: past,
      depositStatus: 'paid',
      depositAmount: 450_000,
      paymentMethod: 'mercadopago',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('radio', { name: /El complejo necesita cancelar/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'El turno ya se jugó: la seña de $ 4.500 queda para el complejo (sin reembolso).',
    )
    expect(screen.getByRole('dialog')).not.toHaveTextContent('queda para devolver')
  })
})
