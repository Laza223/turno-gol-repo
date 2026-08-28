import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { BookingRow } from '@/modules/bookings/booking.types'
import { booking } from '@/test/fixtures/booking'
import { pendingAction } from '@/test/pending-action'
import { BookingFormModal, type CreateBookingAction } from './BookingFormModal'

// BookingActionResult vive en '@/app/(admin)/reservas/actions' ('use server'):
// no-restricted-imports bloquea cualquier import de ese patrón, incluso
// `import type` (mismo gotcha documentado en InviteStaffDialog.stories.tsx).
// Se deriva el tipo del propio prop del componente en vez de importarlo directo.
type BookingActionResult = Awaited<ReturnType<CreateBookingAction>>

/**
 * `open`/`onClose` son props controladas (no hay estado interno de apertura,
 * ver el comentario de BookingFormModal.tsx) — igual que ConfirmDialogDemo en
 * confirm-dialog.stories.tsx, un wrapper local con `useState` reproduce cómo
 * el único caller real (BookingGrid.handleBookingSuccess) cierra el modal en
 * onSuccess (setSelectedSlot(null)).
 */
function BookingFormModalCloseOnSuccessDemo({
  action,
  onSuccess,
}: {
  action: CreateBookingAction
  onSuccess: (booking: BookingRow) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <BookingFormModal
      slot={{
        courtId: 'court-1',
        courtName: 'Cancha 1',
        date: '2026-03-14',
        timeStart: '18:00',
        durationMins: 60,
      }}
      open={open}
      onClose={() => setOpen(false)}
      action={action}
      onSuccess={(b) => {
        setOpen(false)
        onSuccess(b)
      }}
    />
  )
}

/**
 * `action` (createBookingAction real en la app) entra por PROP, no por import
 * — ver el comentario en BookingFormModal.tsx. Es un Radix Dialog portaled a
 * `document.body`: las queries del `play` van contra `canvasElement.ownerDocument.body`,
 * no contra `canvasElement` (mismo patrón que confirm-dialog.stories.tsx).
 *
 * `action` NO tiene default en `meta.args`: cada story la resuelve distinto
 * (success/error/nunca-resuelve) y TS solo permite ese tipo de unión si el
 * default de `meta` nunca "fija" una de las variantes (mismo patrón que
 * InviteStaffDialog.stories.tsx con `inviteAction`).
 */
const meta = {
  title: 'Booking/Grid/BookingFormModal',
  component: BookingFormModal,
  parameters: { layout: 'centered' },
  args: {
    slot: {
      courtId: 'court-1',
      courtName: 'Cancha 1',
      date: '2026-03-14',
      timeStart: '18:00',
      durationMins: 60,
    },
    open: true,
    onClose: fn(),
    onSuccess: fn(),
  },
} satisfies Meta<typeof BookingFormModal>

export default meta
type Story = StoryObj<typeof meta>

/** Motivo por defecto ("Reserva Telefónica"): contacto opcional, cotiza normal. */
export const Default: Story = {
  args: {
    action: fn(async () => ({
      success: true as const,
      booking: booking(),
      depositAfterClose: false,
    })),
  },
}

/**
 * Fase 3 UX (progressive disclosure): teléfono y notas internas viven
 * colapsados bajo "Opciones avanzadas" — click en el trigger los revela y
 * siguen siendo campos normales del <form> (mismos name= que espera la action).
 */
export const OpcionesAvanzadasExpandidas: Story = {
  name: 'Click en "Opciones avanzadas" — guestPhone y notesInternal quedan usables',
  args: {
    action: fn(async () => ({
      success: true as const,
      booking: booking(),
      depositAfterClose: false,
    })),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    // forceMount: el campo queda en el DOM (serializa en FormData aun
    // colapsado), pero no visible hasta abrir "Opciones avanzadas".
    await expect(body.getByLabelText(/Teléfono/)).not.toBeVisible()

    await userEvent.click(body.getByRole('button', { name: 'Opciones avanzadas' }))

    const phoneInput = await body.findByLabelText(/Teléfono/)
    await waitFor(() => expect(phoneInput).toBeVisible())
    await userEvent.type(phoneInput, '11 2233-4455')
    await expect(phoneInput).toHaveValue('11 2233-4455')

    const notes = body.getByLabelText(/Notas internas/)
    await waitFor(() => expect(notes).toBeVisible())
    await userEvent.type(notes, 'Cliente pidió pelota extra')
    await expect(notes).toHaveValue('Cliente pidió pelota extra')
  },
}

export const BloqueoInterno: Story = {
  name: 'Motivo "Mantenimiento": sin contacto, selector de duración 60/120',
  args: {
    action: fn(async () => ({
      success: true as const,
      booking: booking(),
      depositAfterClose: false,
    })),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.selectOptions(body.getByLabelText('Motivo / Tipo de Bloqueo'), 'maintenance')
    await expect(body.queryByLabelText(/Nombre/)).not.toBeInTheDocument()
    // El selector de duración no son dos botones "60 min"/"120 min": es un
    // popover de horario de fin que lista N horas (`endOptions`). La story
    // esperaba un copy que el componente nunca tuvo desde que existe el popover.
    await userEvent.click(body.getByRole('button', { name: 'Seleccionar horario de fin' }))
    await expect(await body.findByRole('button', { name: /\(2 horas\)/ })).toBeInTheDocument()
    // Cerrar antes de terminar: el popover de Radix vive en un portal fuera del
    // canvas y si queda abierto la story siguiente lo encuentra montado.
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(body.queryByRole('button', { name: /\(2 horas\)/ })).not.toBeInTheDocument(),
    )
  },
}

/**
 * Lo cobrado es respuesta obligatoria en el alta manual: un turno cargado a mano
 * no tiene ningún hecho de cobro detrás salvo lo que afirme el mostrador. Las
 * stories que llegan al submit tienen que contestar, y "No cobré" es la
 * respuesta del complejo que cobra al terminar de jugar.
 */
async function contestarSinCobro(body: ReturnType<typeof within>) {
  await userEvent.selectOptions(body.getByLabelText('¿Cobraste algo ahora?'), 'none')
}

const guardando = pendingAction<BookingActionResult>({
  success: true as const,
  booking: booking(),
  depositAfterClose: false,
})

export const Guardando: Story = {
  name: 'isPending=true — botón "Guardando…" con spinner',
  args: {
    // La action queda en vuelo para fijar el estado de carga, y el play la
    // libera al final.
    action: fn(guardando.action),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await contestarSinCobro(body)
    await userEvent.click(body.getByRole('button', { name: 'Confirmar' }))
    const guardandoBtn = await body.findByRole('button', { name: 'Guardando…' })
    await expect(guardandoBtn).toBeDisabled()
    // Sin release la transición queda viva y contamina las 4 stories siguientes
    // del archivo (ver el docstring de pendingAction).
    await guardando.release(guardandoBtn)
  },
}

export const ErrorDelServidor: Story = {
  name: 'La action devuelve { success: false } — alert rojo',
  args: {
    action: fn(async () => ({ success: false as const, error: 'Este turno acaba de ser tomado.' })),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await contestarSinCobro(body)
    await userEvent.click(body.getByRole('button', { name: 'Confirmar' }))
    await expect(await body.findByRole('alert')).toHaveTextContent(
      'Este turno acaba de ser tomado.',
    )
  },
}

export const Cerrado: Story = {
  name: 'open=false — el diálogo no se monta',
  args: {
    open: false,
    action: fn(async () => ({
      success: true as const,
      booking: booking(),
      depositAfterClose: false,
    })),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(body.queryByRole('dialog')).not.toBeInTheDocument()
  },
}

/**
 * Fase 4 UX: la grilla puede quedar desactualizada — este chequeo optimista
 * (checkAvailabilityAction, prop opcional) avisa al abrir el modal si otro
 * admin ya tomó el turno, sin bloquear el submit (el server sigue decidiendo).
 */
export const AvisoDeColisionOptimista: Story = {
  name: 'checkAvailabilityAction → available:false — aviso temprano de colisión',
  args: {
    action: fn(async () => ({
      success: true as const,
      booking: booking(),
      depositAfterClose: false,
    })),
    checkAvailabilityAction: fn(async () => ({ available: false })),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('alert')).toHaveTextContent(
      'Este turno acaba de ser tomado.',
    )
    // Es solo un aviso: el submit sigue habilitado, la fuente de verdad es el server.
    await expect(body.getByRole('button', { name: 'Confirmar' })).toBeEnabled()
  },
}

export const ExitoLlamaOnSuccess: Story = {
  name: 'La action resuelve success:true → onSuccess(booking), cierra el modal',
  args: {
    action: fn(async () => ({
      success: true as const,
      booking: booking(),
      depositAfterClose: false,
    })),
  },
  // Sin BookingFormModalCloseOnSuccessDemo el overlay `bg-black/50` queda
  // abierto (open:true fijo) detrás del toast "Reserva creada" y axe mide el
  // contraste del texto contra ese negro translúcido: un estado que nunca
  // ocurre en producción, donde el modal se cierra en el mismo tick que se
  // dispara el toast.
  render: (args) => (
    <BookingFormModalCloseOnSuccessDemo action={args.action} onSuccess={args.onSuccess} />
  ),
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)
    await contestarSinCobro(body)
    await userEvent.click(body.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(args.onSuccess).toHaveBeenCalledOnce())
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument())
  },
}
