import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { pendingAction } from '@/test/pending-action'
import { Button } from './button'
import { ConfirmDialog, type ConfirmDialogProps } from './confirm-dialog'

/**
 * `open`/`onOpenChange` son props controladas (no hay estado interno de
 * apertura) — cada story arma un wrapper local con `useState` + un botón que
 * reabre el diálogo tras cerrarlo, igual que lo maneja cualquier padre real
 * (AbonadoDialogs, CloseDayButton, CourtList).
 */
function ConfirmDialogDemo(props: Omit<ConfirmDialogProps, 'open' | 'onOpenChange'>) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Reabrir diálogo
      </Button>
      <ConfirmDialog {...props} open={open} onOpenChange={setOpen} />
    </div>
  )
}

const meta = {
  title: 'Design System/ConfirmDialog',
  component: ConfirmDialog,
  parameters: { layout: 'centered' },
  // Cada story usa `render` con su propio wrapper controlado (ConfirmDialogDemo)
  // y no lee `args`; este default solo satisface el tipo (todas las props son
  // requeridas salvo las opcionales de personalización).
  args: {
    open: true,
    onOpenChange: () => {},
    title: 'Confirmar acción',
    onConfirm: async () => ({ success: true as const }),
  },
} satisfies Meta<typeof ConfirmDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <ConfirmDialogDemo
      title="Completar reserva"
      description="Se va a marcar como jugada. Esta acción no se puede deshacer."
      onConfirm={fn(async () => ({ success: true as const }))}
    />
  ),
}

/** `variant="destructive"`: botón de confirmar en rojo, separado del cancelar (MASTER §6). */
export const Destructivo: Story = {
  render: () => (
    <ConfirmDialogDemo
      title="Cancelar reserva"
      description="El jugador va a recibir un email de aviso. Esta acción no se puede deshacer."
      variant="destructive"
      confirmLabel="Cancelar reserva"
      onConfirm={fn(async () => ({ success: true as const }))}
    />
  ),
}

/** `consequences`: lista de consecuencias concretas, en vez de armar el `<ul>` a mano en `description`. */
export const ConConsecuencias: Story = {
  render: () => (
    <ConfirmDialogDemo
      title="Marcar como ausente"
      variant="destructive"
      confirmLabel="Marcar ausente"
      consequences={[
        'La seña pagada ($8.000) queda para el complejo.',
        'Si es su 2ª ausencia en 90 días, queda bloqueado 14 días para reservar online.',
        'Podés deshacerlo hasta 24hs después.',
      ]}
      onConfirm={fn(async () => ({ success: true as const }))}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(body.getByText(/queda para el complejo/)).toBeInTheDocument()
    await expect(body.getByText(/bloqueado 14 días/)).toBeInTheDocument()
  },
}

/** Type-to-confirm: el botón queda deshabilitado hasta que el texto coincida exacto. */
export const ConFraseDeConfirmacion: Story = {
  render: () => (
    <ConfirmDialogDemo
      title="Cancelar abonado"
      description="Se cancelan todas las reservas futuras del abonado."
      variant="destructive"
      confirmationPhrase="CANCELAR"
      onConfirm={fn(async () => ({ success: true as const }))}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const confirmButton = await body.findByRole('button', { name: 'Confirmar' })
    await expect(confirmButton).toBeDisabled()

    await userEvent.type(body.getByLabelText(/Escribí/), 'CANCELAR')
    await expect(confirmButton).toBeEnabled()
  },
}

const procesando = pendingAction<{ success: true }>({ success: true })

/** `onConfirm` queda en vuelo: el modal muestra "Procesando…" con los botones deshabilitados. */
export const Procesando: Story = {
  render: () => (
    <ConfirmDialogDemo
      title="Cerrar caja"
      description="Se registra el cierre del día con los montos declarados."
      onConfirm={procesando.action}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('button', { name: 'Confirmar' }))
    const pending = await body.findByRole('button', { name: 'Procesando…' })
    await expect(pending).toBeDisabled()
    await expect(body.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    // Sin release la transición queda viva y contamina las 2 stories siguientes
    // del archivo (ver el docstring de pendingAction).
    await procesando.release(pending)
  },
}

/** `onConfirm` devuelve `{ success: false, error }`: el modal queda abierto con el error inline. */
export const ErrorControlado: Story = {
  render: () => (
    <ConfirmDialogDemo
      title="Confirmar pago"
      description="Registra la seña como pagada."
      onConfirm={fn(async () => ({ success: false, error: 'El monto supera el saldo pendiente.' }))}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('button', { name: 'Confirmar' }))
    await expect(await body.findByRole('alert')).toHaveTextContent(
      'El monto supera el saldo pendiente.',
    )
    // waitFor: la actualización que agrega el alert puede coincidir con un
    // tick en el que toBeVisible() lee opacity de la transición en curso.
    await waitFor(() => expect(body.getByRole('dialog')).toBeVisible())
  },
}

/** `onConfirm` lanza una excepción (ej. error de red): se reporta a Sentry y se muestra un error genérico. */
export const ErrorInesperado: Story = {
  render: () => (
    <ConfirmDialogDemo
      title="Confirmar pago"
      description="Registra la seña como pagada."
      onConfirm={fn(async () => {
        throw new Error('Network error')
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(await body.findByRole('button', { name: 'Confirmar' }))
    await expect(await body.findByRole('alert')).toHaveTextContent(
      /no se pudo completar la acción/i,
    )
  },
}
