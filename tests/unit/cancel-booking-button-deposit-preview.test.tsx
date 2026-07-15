// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { CancelBookingButton } from '@/app/(player)/mis-reservas/CancelBookingButton'

afterEach(() => cleanup())

const noopAction = vi.fn(async () => ({ success: true as const, booking: {} as never }))

/**
 * ENS-2: el modal de cancelación del jugador tiene que decir la consecuencia
 * CONCRETA de cancelar ESTE turno (no la explicación abstracta "si estás en
 * el plazo... fuera del plazo...").
 */
describe('CancelBookingButton — consecuencia concreta de cancelar (ENS-2)', () => {
  function open(props: Partial<Parameters<typeof CancelBookingButton>[0]> = {}) {
    render(
      <CancelBookingButton
        bookingId="booking-1"
        courtName="Cancha 1"
        dateLabel="sáb, 14 mar"
        timeLabel="18:00–19:00"
        cancellationOutcome="refund"
        depositAmountCents={0}
        action={noopAction}
        {...props}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    return screen.getByRole('dialog')
  }

  it('sin seña paga: avisa que no hay nada que devolver', () => {
    const dialog = open({ cancellationOutcome: 'no_deposit', depositAmountCents: 0 })
    expect(dialog).toHaveTextContent('No hay seña que devolver.')
  })

  it('dentro de la ventana de reembolso: dice el monto que se devuelve', () => {
    const dialog = open({ cancellationOutcome: 'refund', depositAmountCents: 450_000 })
    expect(dialog).toHaveTextContent('Se te devuelve la seña de $ 4.500.')
  })

  it('fuera de la ventana de reembolso: dice el monto que se pierde', () => {
    const dialog = open({ cancellationOutcome: 'no_refund', depositAmountCents: 450_000 })
    expect(dialog).toHaveTextContent('Perdés la seña de $ 4.500.')
  })

  it('ya no muestra la explicación abstracta de la política', () => {
    const dialog = open({ cancellationOutcome: 'refund', depositAmountCents: 450_000 })
    expect(dialog).not.toHaveTextContent(/Si estás en el plazo/i)
  })
})
