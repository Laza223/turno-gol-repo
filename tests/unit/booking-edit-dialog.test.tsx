// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

import { BookingEditDialog } from '@/components/booking/BookingEditDialog'
import { booking, bookingFixed, bookingGuest, toGridBooking } from '@/test/fixtures/booking'
import { player, playerAlt } from '@/test/fixtures/player'
import { staffManager } from '@/test/fixtures/staff'

/**
 * D2 (2026-09-15): editar nombre/teléfono de invitado, duración (evento
 * `spontaneous` cargado por el staff) y precio, sin mover el turno.
 *
 * `guestPhone`/`createdByStaff` no viajan en `GridBooking` — el diálogo los
 * pide con `getDetailAction` al abrir, así que todos los tests esperan esa
 * resolución antes de mirar el formulario.
 */

const DAY_SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00']

afterEach(cleanup)

describe('BookingEditDialog', () => {
  it('muestra "Cargando…" mientras no resolvió el detalle, y después el formulario', async () => {
    let resolveDetail: (v: unknown) => void = () => {}
    const getDetailAction = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveDetail = resolve
        }),
    )

    render(
      <BookingEditDialog
        open
        onOpenChange={vi.fn()}
        booking={toGridBooking(bookingGuest())}
        dayBookings={[]}
        daySlots={DAY_SLOTS}
        getDetailAction={getDetailAction as never}
        editAction={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    expect(screen.getByText('Cargando…')).toBeInTheDocument()

    resolveDetail({ success: true, guestPhone: '+54 9 11 4444-5555', createdByStaff: null })

    await waitFor(() => expect(screen.queryByText('Cargando…')).toBeNull())
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
  })

  it('invitado: precarga nombre y teléfono con lo que trae el detalle', async () => {
    render(
      <BookingEditDialog
        open
        onOpenChange={vi.fn()}
        booking={toGridBooking(bookingGuest())}
        dayBookings={[]}
        daySlots={DAY_SLOTS}
        getDetailAction={vi.fn(async () => ({
          success: true as const,
          guestPhone: '+54 9 11 4444-5555',
          createdByStaff: staffManager().id,
        }))}
        editAction={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    const name = (await screen.findByLabelText('Nombre')) as HTMLInputElement
    const phone = (await screen.findByLabelText('Teléfono')) as HTMLInputElement
    expect(name.value).toBe('Fernando Bianchi')
    expect(phone.value).toBe('+54 9 11 4444-5555')
  })

  it('jugador registrado: no ofrece editar nombre ni teléfono', async () => {
    render(
      <BookingEditDialog
        open
        onOpenChange={vi.fn()}
        booking={toGridBooking(booking(), player())}
        dayBookings={[]}
        daySlots={DAY_SLOTS}
        getDetailAction={vi.fn(async () => ({
          success: true as const,
          guestPhone: null,
          createdByStaff: null,
        }))}
        editAction={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    await screen.findByRole('button', { name: 'Guardar cambios' })
    expect(screen.queryByLabelText('Nombre')).toBeNull()
    expect(screen.queryByLabelText('Teléfono')).toBeNull()
  })

  it('evento cargado por el staff: ofrece "Hasta"; una reserva online, no', async () => {
    const staffBooking = toGridBooking(bookingGuest()) // type='spontaneous'

    const { unmount } = render(
      <BookingEditDialog
        open
        onOpenChange={vi.fn()}
        booking={staffBooking}
        dayBookings={[]}
        daySlots={DAY_SLOTS}
        getDetailAction={vi.fn(async () => ({
          success: true as const,
          guestPhone: null,
          createdByStaff: staffManager().id,
        }))}
        editAction={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )
    await screen.findByLabelText('Hasta')
    unmount()

    render(
      <BookingEditDialog
        open
        onOpenChange={vi.fn()}
        booking={staffBooking}
        dayBookings={[]}
        daySlots={DAY_SLOTS}
        getDetailAction={vi.fn(async () => ({
          success: true as const,
          guestPhone: null,
          // `created_by_staff` NULL = reserva online: D2 nunca deja tocar su duración.
          createdByStaff: null,
        }))}
        editAction={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )
    await screen.findByRole('button', { name: 'Guardar cambios' })
    expect(screen.queryByLabelText('Hasta')).toBeNull()
  })

  it('guarda: llama a editAction con bookingId y el nombre editado', async () => {
    const editAction = vi.fn(async () => ({ success: true as const }))
    const onSuccess = vi.fn()
    const guest = bookingGuest()

    render(
      <BookingEditDialog
        open
        onOpenChange={vi.fn()}
        booking={toGridBooking(guest)}
        dayBookings={[]}
        daySlots={DAY_SLOTS}
        getDetailAction={vi.fn(async () => ({
          success: true as const,
          guestPhone: guest.guestPhone,
          createdByStaff: staffManager().id,
        }))}
        editAction={editAction}
        onSuccess={onSuccess}
      />,
    )

    const name = (await screen.findByLabelText('Nombre')) as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Nuevo Nombre' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(editAction).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: guest.id, guestName: 'Nuevo Nombre' }),
      ),
    )
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  // 🟡 Hallazgo 7 (auditoría 2026-09-16): vaciar el campo de teléfono tiene que
  // mandarse como '' (no omitirse) — es la señal de "borrarlo a propósito".
  it('vacía el teléfono: llama a editAction con guestPhone: ""', async () => {
    const editAction = vi.fn(async () => ({ success: true as const }))
    const guest = bookingGuest()

    render(
      <BookingEditDialog
        open
        onOpenChange={vi.fn()}
        booking={toGridBooking(guest)}
        dayBookings={[]}
        daySlots={DAY_SLOTS}
        getDetailAction={vi.fn(async () => ({
          success: true as const,
          guestPhone: guest.guestPhone,
          createdByStaff: staffManager().id,
        }))}
        editAction={editAction}
        onSuccess={vi.fn()}
      />,
    )

    const phone = (await screen.findByLabelText('Teléfono')) as HTMLInputElement
    expect(phone.value).toBe(guest.guestPhone)
    fireEvent.change(phone, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(editAction).toHaveBeenCalledWith(expect.objectContaining({ guestPhone: '' })),
    )
  })

  // 🟡 Hallazgo 8 (auditoría 2026-09-16): mismo aviso que el precio, para el
  // nombre — corregirlo en una sesión de abonado sin jugador vinculado sólo
  // aplica a esta fecha, el worker rolling la vuelve a generar con
  // `abonados.contact_name`.
  it('sesión de abonado sin jugador: avisa que el nombre es sólo para esta fecha', async () => {
    render(
      <BookingEditDialog
        open
        onOpenChange={vi.fn()}
        booking={toGridBooking(
          booking({ type: 'fixed', playerId: null, guestName: 'Escuelita Martes' }),
        )}
        dayBookings={[]}
        daySlots={DAY_SLOTS}
        getDetailAction={vi.fn(async () => ({
          success: true as const,
          guestPhone: null,
          createdByStaff: null,
        }))}
        editAction={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    await screen.findByLabelText('Nombre')
    expect(
      screen.getByText(
        'Turno fijo: este nombre es sólo para esta fecha, no cambia el contacto del abonado.',
      ),
    ).toBeInTheDocument()
  })

  it('invitado común (no abonado): no muestra el aviso de nombre', async () => {
    render(
      <BookingEditDialog
        open
        onOpenChange={vi.fn()}
        booking={toGridBooking(bookingGuest())}
        dayBookings={[]}
        daySlots={DAY_SLOTS}
        getDetailAction={vi.fn(async () => ({
          success: true as const,
          guestPhone: null,
          createdByStaff: staffManager().id,
        }))}
        editAction={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    await screen.findByLabelText('Nombre')
    expect(
      screen.queryByText(
        'Turno fijo: este nombre es sólo para esta fecha, no cambia el contacto del abonado.',
      ),
    ).toBeNull()
  })

  it('sesión de abonado: avisa que el precio es sólo para esta fecha, no para el contrato', async () => {
    render(
      <BookingEditDialog
        open
        onOpenChange={vi.fn()}
        booking={toGridBooking(bookingFixed(), playerAlt())}
        dayBookings={[]}
        daySlots={DAY_SLOTS}
        getDetailAction={vi.fn(async () => ({
          success: true as const,
          guestPhone: null,
          createdByStaff: null,
        }))}
        editAction={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    await screen.findByRole('button', { name: 'Guardar cambios' })
    expect(
      screen.getByText('Turno fijo: este precio es sólo para esta fecha, no cambia el contrato.'),
    ).toBeInTheDocument()
  })

  it('turno común (no abonado): no muestra el aviso de turno fijo', async () => {
    render(
      <BookingEditDialog
        open
        onOpenChange={vi.fn()}
        booking={toGridBooking(booking(), player())}
        dayBookings={[]}
        daySlots={DAY_SLOTS}
        getDetailAction={vi.fn(async () => ({
          success: true as const,
          guestPhone: null,
          createdByStaff: null,
        }))}
        editAction={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    await screen.findByRole('button', { name: 'Guardar cambios' })
    expect(
      screen.queryByText('Turno fijo: este precio es sólo para esta fecha, no cambia el contrato.'),
    ).toBeNull()
  })

  it('muestra el error del server sin cerrar el diálogo', async () => {
    const editAction = vi.fn(async () => ({
      success: false as const,
      error: 'Ese precio es menor a lo que ya se cobró de este turno.',
    }))
    const onSuccess = vi.fn()

    render(
      <BookingEditDialog
        open
        onOpenChange={vi.fn()}
        booking={toGridBooking(bookingGuest())}
        dayBookings={[]}
        daySlots={DAY_SLOTS}
        getDetailAction={vi.fn(async () => ({
          success: true as const,
          guestPhone: null,
          createdByStaff: staffManager().id,
        }))}
        editAction={editAction}
        onSuccess={onSuccess}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Ese precio es menor a lo que ya se cobró de este turno.',
      ),
    )
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
