import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { booking } from '@/test/fixtures/booking'
import { BookingFormModal, type CreateBookingAction } from './BookingFormModal'

// BookingActionResult vive en '@/app/(admin)/reservas/actions' ('use server'):
// no-restricted-imports bloquea cualquier import de ese patrón, incluso
// `import type` (mismo gotcha documentado en InviteStaffDialog.stories.tsx).
// Se deriva el tipo del propio prop del componente en vez de importarlo directo.
type BookingActionResult = Awaited<ReturnType<CreateBookingAction>>

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
  args: { action: fn(async () => ({ success: true as const, booking: booking() })) },
}

export const BloqueoInterno: Story = {
  name: 'Motivo "Mantenimiento": sin contacto, selector de duración 60/120',
  args: { action: fn(async () => ({ success: true as const, booking: booking() })) },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.selectOptions(body.getByLabelText('Motivo / Tipo de Bloqueo'), 'maintenance')
    await expect(body.queryByLabelText(/Nombre/)).not.toBeInTheDocument()
    await expect(body.getByRole('button', { name: '120 min' })).toBeInTheDocument()
  },
}

export const Guardando: Story = {
  name: 'isPending=true — botón "Guardando…" con spinner',
  args: {
    // La action nunca resuelve dentro de la story: fija el estado de carga.
    action: fn(() => new Promise<BookingActionResult>(() => {})),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(body.getByRole('button', { name: 'Confirmar' }))
    await expect(await body.findByRole('button', { name: 'Guardando…' })).toBeDisabled()
  },
}

export const ErrorDelServidor: Story = {
  name: 'La action devuelve { success: false } — alert rojo',
  args: {
    action: fn(async () => ({ success: false as const, error: 'Este turno acaba de ser tomado.' })),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(body.getByRole('button', { name: 'Confirmar' }))
    await expect(await body.findByRole('alert')).toHaveTextContent('Este turno acaba de ser tomado.')
  },
}

export const Cerrado: Story = {
  name: 'open=false — el diálogo no se monta',
  args: {
    open: false,
    action: fn(async () => ({ success: true as const, booking: booking() })),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(body.queryByRole('dialog')).not.toBeInTheDocument()
  },
}

export const ExitoLlamaOnSuccess: Story = {
  name: 'La action resuelve success:true → onSuccess(booking)',
  args: { action: fn(async () => ({ success: true as const, booking: booking() })) },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(body.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(args.onSuccess).toHaveBeenCalledOnce())
  },
}
