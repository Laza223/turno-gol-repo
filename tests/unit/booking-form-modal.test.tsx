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

    // Contact path: guest name input is present by default; el teléfono es
    // secundario (Fase 3 UX, progressive disclosure) y vive colapsado bajo
    // "Opciones avanzadas". forceMount lo deja en el DOM aun colapsado (debe
    // serializar en FormData), así que acá se asserta el estado del trigger,
    // no la presencia del input (happy-dom no computa el CSS de Tailwind).
    expect(screen.queryByLabelText(/Nombre/i)).toBeTruthy()
    const advancedTrigger = screen.getByRole('button', { name: 'Opciones avanzadas' })
    expect(advancedTrigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(advancedTrigger)
    expect(advancedTrigger.getAttribute('aria-expanded')).toBe('true')
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

  it('advanced fields filled then RE-collapsed still reach the payload (forceMount)', async () => {
    createBookingAction.mockResolvedValueOnce({ success: true, booking: { id: 'b' } })
    renderModal()

    const advancedTrigger = screen.getByRole('button', { name: 'Opciones avanzadas' })
    fireEvent.click(advancedTrigger)
    fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Juan' } })
    fireEvent.change(screen.getByLabelText(/Tel[eé]fono/i), { target: { value: '11-1234-5678' } })
    fireEvent.change(screen.getByLabelText(/Notas internas/i), { target: { value: 'llega tarde' } })
    // Colapsar de nuevo ANTES de confirmar: sin forceMount, Radix desmontaba
    // los inputs y el FormData perdía estos campos en silencio (bug real
    // atrapado por verificación adversarial, Fase 3).
    fireEvent.click(advancedTrigger)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(createBookingAction).toHaveBeenCalled())
    expect(lastPayload()).toMatchObject({
      guestName: 'Juan',
      guestPhone: '+54 11-1234-5678',
      notesInternal: 'llega tarde',
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

// Fase 4 UX — chequeo optimista de disponibilidad al abrir el modal. La prop
// es opcional: sin ella, ningún caller/story vieja se rompe.
describe('BookingFormModal — checkAvailabilityAction (Fase 4 UX)', () => {
  it('available:false al abrir muestra el aviso de colisión (mismo copy que el server)', async () => {
    const checkAvailabilityAction = vi.fn(async () => ({ available: false }))
    renderModal({ checkAvailabilityAction })

    await waitFor(() => expect(checkAvailabilityAction).toHaveBeenCalledWith({
      courtId: slot.courtId,
      date: slot.date,
      timeStart: slot.timeStart,
    }))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Este turno acaba de ser tomado.')
    })
    // Es solo un aviso: el submit sigue habilitado, el server decide.
    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('available:true al abrir no muestra ningún aviso', async () => {
    const checkAvailabilityAction = vi.fn(async () => ({ available: true }))
    renderModal({ checkAvailabilityAction })

    await waitFor(() => expect(checkAvailabilityAction).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sin la prop, el comportamiento queda intacto (no rompe nada existente)', async () => {
    renderModal()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeTruthy()
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
