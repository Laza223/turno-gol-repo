import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, waitForElementToBeRemoved, within } from 'storybook/test'
import { artDateString } from '@/test/fixtures'
import { RegisterMovementModal, type CreateCashFlowAction } from './RegisterMovementModal'
import type { CashFlowActionResult } from '../actions'

// RegisterMovementModal es controlado (open/onClose por props, dueño real =
// CajaActions). "GuardarOk" necesita que el modal CIERRE de verdad al confirmar
// — si no, el overlay (bg-black/50) del Dialog sigue tapando la pantalla y el
// toast de éxito queda leyéndose sobre ese fondo oscurecido en vez del fondo
// real de la app (mismo bug de contenedor falso que la regla 2 previene).
function ControlledModal({
  open: openProp,
  onClose,
  ...rest
}: {
  open: boolean
  onClose: () => void
  date: string
  createCashFlowAction: CreateCashFlowAction
}) {
  const [open, setOpen] = useState(openProp)
  return (
    <RegisterMovementModal
      {...rest}
      open={open}
      onClose={() => {
        setOpen(false)
        onClose()
      }}
    />
  )
}

/**
 * Radix Dialog porta a `document.body` con su propia superficie
 * (`bg-popover/95`): no depende del fondo de Caja, no hace falta un
 * contenedor especial (regla 2).
 */
const meta = {
  title: 'Admin/Caja/RegisterMovementModal',
  component: RegisterMovementModal,
  parameters: { layout: 'padded' },
  args: {
    open: true,
    date: artDateString(),
    onClose: fn(),
    createCashFlowAction: fn(
      async (): Promise<CashFlowActionResult> => ({
        success: true,
        cashFlow: {
          id: 'cf-1',
          tenantId: 't-1',
          type: 'income',
          category: 'booking',
          amount: 450000,
          method: 'cash',
          description: 'Reserva 20:00',
          bookingId: null,
          productId: null,
          registeredBy: 's-1',
          occurredAt: new Date(),
          createdAt: new Date(),
        },
      }),
    ),
  },
} satisfies Meta<typeof RegisterMovementModal>

export default meta
type Story = StoryObj<typeof meta>

/** Tipo por defecto: Ingreso, categoría Reserva. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await expect(canvas.getByRole('button', { name: 'Ingreso' })).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByRole('button', { name: 'Reserva' })).toHaveAttribute('aria-pressed', 'true')
  },
}

/** Cambiar a "Gasto" re-selecciona la única categoría válida: Gasto operativo. */
export const TipoGasto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Gasto' }))
    await expect(canvas.getByRole('button', { name: 'Gasto operativo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

/** Ajuste: corrección por ausencia u otro — categorías propias del tipo. */
export const TipoAjuste: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    // El modal arranca abierto (args.open=true desde el mount): la animación
    // de entrada de Radix (fade-in ~200ms) puede seguir en curso.
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Ingreso' })).toBeVisible())
    await userEvent.click(canvas.getByRole('button', { name: 'Ajuste' }))
    // "Otro" existe también como método de pago: scopeado a la categoría por su legend.
    const categoryGroup = within(canvas.getByRole('group', { name: 'Categoría' }))
    await expect(categoryGroup.getByRole('button', { name: 'Corrección por ausencia' })).toBeVisible()
    await expect(categoryGroup.getByRole('button', { name: 'Otro' })).toBeVisible()
  },
}

/** Monto vacío o descripción vacía: error inline, no dispara la action. */
export const ErrorDeValidacion: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/monto válido/i)
    await expect(args.createCashFlowAction).not.toHaveBeenCalled()
  },
}

/** Completar y guardar: llama la action con los datos del form y cierra el modal. */
export const GuardarOk: Story = {
  render: (args) => <ControlledModal {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    const dialogEl = canvas.getByRole('dialog')
    await userEvent.type(canvas.getByLabelText('Monto (pesos)'), '4500')
    await userEvent.type(canvas.getByLabelText('Descripción'), 'Seña turno 20:00')
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar' }))

    await expect(args.createCashFlowAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'income', category: 'booking', amount: 450000 }),
    )
    await expect(args.onClose).toHaveBeenCalled()
    // El modal cierra de verdad (ControlledModal): esperamos a que el overlay
    // se remueva antes de leer el toast, si no queda leyéndose sobre el fondo
    // oscurecido del Dialog en vez del fondo real de la página.
    await waitForElementToBeRemoved(dialogEl)
    await waitFor(() => expect(canvas.getByText('Movimiento registrado')).toBeVisible())
  },
}

/** La action devuelve un error de negocio (ej. día ya cerrado): el modal se mantiene abierto. */
export const ErrorDelServidor: Story = {
  args: {
    createCashFlowAction: fn(
      async (): Promise<CashFlowActionResult> => ({
        success: false,
        error: 'La caja de ese día ya fue cerrada. Registrá un ajuste compensatorio.',
      }),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.type(canvas.getByLabelText('Monto (pesos)'), '4500')
    await userEvent.type(canvas.getByLabelText('Descripción'), 'Venta cantina')
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/ya fue cerrada/i)
  },
}
