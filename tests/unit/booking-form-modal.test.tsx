// @vitest-environment happy-dom
/**
 * Regression tests for BookingFormModal's loading-state recovery.
 *
 * The bug: the submit handler runs `await createBookingAction()` inside a
 * transition with no try/catch. If the action *throws* (network drop, server
 * crash) instead of returning `{ success: false }`, the button stays stuck on
 * "Guardando…". These tests pin that a thrown action recovers the button and
 * surfaces a readable error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

import { BookingFormModal } from '@/components/booking/BookingFormModal'

// La action llega por PROP (no por import: ver el comentario en
// BookingFormModal.tsx), así que el test la mockea como cualquier otro
// callback — ya no hace falta vi.mock del módulo de actions.
const createBookingAction = vi.fn()

const slot = {
  courtId: 'court-1',
  courtName: 'Cancha 1',
  date: '2026-06-10',
  timeStart: '18:00',
  durationMins: 60 as const,
}

function renderModal(overrides: Partial<React.ComponentProps<typeof BookingFormModal>> = {}) {
  const onClose = vi.fn()
  const onSuccess = vi.fn()
  render(
    <BookingFormModal
      slot={slot}
      open
      onClose={onClose}
      onSuccess={onSuccess}
      action={createBookingAction}
      {...overrides}
    />,
  )
  return { onClose, onSuccess }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BookingFormModal — loading recovery', () => {
  it('a thrown action does not leave the button stuck on "Guardando…"', async () => {
    createBookingAction.mockRejectedValueOnce(new Error('network down'))
    const { onSuccess } = renderModal()

    const submit = screen.getByRole('button', { name: 'Confirmar' })
    fireEvent.click(submit)

    // Button recovers to its idle label instead of hanging on "Guardando…".
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeTruthy()
    })
    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(false)

    // A recoverable error is shown to the user.
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/no pudimos crear la reserva/i)
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('an action returning { success:false } shows the server error', async () => {
    createBookingAction.mockResolvedValueOnce({ success: false, error: 'Horario ocupado' })
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Horario ocupado')
    })
    // Dentro de un waitFor: React 19 hizo las transiciones async de verdad, así que
    // `isPending` sigue true un tick después de que el error ya está en el DOM. Si
    // el botón nunca se recupera, el waitFor expira y el test falla igual.
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled,
      ).toBe(false)
    })
  })

  it('a successful action calls onSuccess with the booking', async () => {
    const booking = { id: 'b-1' }
    createBookingAction.mockResolvedValueOnce({ success: true, booking })
    const { onSuccess } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(booking)
    })
  })
})

describe('BookingFormModal — reason / block-type dropdown', () => {
  function lastPayload() {
    return createBookingAction.mock.calls.at(-1)?.[0] as Record<string, unknown>
  }

  it('defaults to "Reserva Telefónica": contact fields visible, spontaneous on submit', async () => {
    createBookingAction.mockResolvedValueOnce({ success: true, booking: { id: 'b' } })
    renderModal()

    // Contact path: guest name/phone inputs are present by default.
    expect(screen.queryByLabelText(/Nombre/i)).toBeTruthy()
    expect(screen.queryByLabelText(/Tel[eé]fono/i)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Juan' } })
    fireEvent.change(screen.getByLabelText(/Tel[eé]fono/i), { target: { value: '11-1234-5678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled())
    expect(lastPayload()).toMatchObject({
      type: 'spontaneous',
      guestName: 'Juan',
      guestPhone: '+54 11-1234-5678',
    })
  })

  it('"Mantenimiento" hides contact fields and submits a block with the reason as guestName', async () => {
    createBookingAction.mockResolvedValueOnce({ success: true, booking: { id: 'b' } })
    renderModal()

    fireEvent.change(screen.getByLabelText(/Motivo/i), { target: { value: 'maintenance' } })

    // Internal block: no free-text contact fields.
    expect(screen.queryByLabelText(/Nombre/i)).toBeNull()
    expect(screen.queryByLabelText(/Tel[eé]fono/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled())
    const payload = lastPayload()
    expect(payload).toMatchObject({ type: 'block', guestName: 'Mantenimiento' })
    expect(payload.guestPhone).toBeUndefined()
  })

  it('"Escuelita de Fútbol" submits a block named after the reason', async () => {
    createBookingAction.mockResolvedValueOnce({ success: true, booking: { id: 'b' } })
    renderModal()

    fireEvent.change(screen.getByLabelText(/Motivo/i), { target: { value: 'school' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled())
    expect(lastPayload()).toMatchObject({ type: 'block', guestName: 'Escuelita de Fútbol' })
  })

  it('"Otro" keeps spontaneous with optional contact (name only, no phone required)', async () => {
    createBookingAction.mockResolvedValueOnce({ success: true, booking: { id: 'b' } })
    renderModal()

    fireEvent.change(screen.getByLabelText(/Motivo/i), { target: { value: 'other' } })
    fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Pepe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled())
    const payload = lastPayload()
    expect(payload).toMatchObject({ type: 'spontaneous', guestName: 'Pepe' })
    expect(payload.guestPhone).toBeUndefined()
  })
})

describe('BookingFormModal — slot de medianoche (día operativo)', () => {
  const midnightSlot = { ...slot, timeStart: '23:00' }

  it('el slot 23:00 envía timeEnd="24:00", no "00:00" (chk_time_valid exige time_end > time_start)', async () => {
    createBookingAction.mockResolvedValueOnce({ success: true, booking: { id: 'b' } })
    renderModal({ slot: midnightSlot })

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled())
    expect(createBookingAction).toHaveBeenCalledWith(
      expect.objectContaining({ timeStart: '23:00', timeEnd: '24:00' }),
    )
  })

  it('el bloqueo interno a las 23:00 no ofrece 120 min (cruzaría medianoche, rango inrepresentable)', async () => {
    renderModal({ slot: midnightSlot })

    fireEvent.change(screen.getByLabelText(/Motivo/i), { target: { value: 'maintenance' } })

    await waitFor(() => expect(screen.getByRole('button', { name: '60 min' })).toBeTruthy())
    expect(screen.queryByRole('button', { name: '120 min' })).toBeNull()
  })

  it('un slot común (18:00) sigue ofreciendo 120 min para bloqueos internos', async () => {
    renderModal()

    fireEvent.change(screen.getByLabelText(/Motivo/i), { target: { value: 'maintenance' } })

    await waitFor(() => expect(screen.getByRole('button', { name: '120 min' })).toBeTruthy())
  })
})
