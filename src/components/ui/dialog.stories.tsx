import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from './button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './dialog'

/**
 * @radix-ui/react-dialog puro, compuesto como en el resto de la app
 * (ConfirmDialog, forms modales): `Trigger` + `Portal/Overlay/Content`. El
 * Portal ya saca el contenido fuera del árbol del canvas — Storybook lo
 * encuentra igual porque el a11y/test-runner miran `document.body`.
 */
const meta = {
  title: 'Design System/Dialog',
  component: Dialog,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

export const Cerrado: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Abrir diálogo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar reserva</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Esta acción no se puede deshacer. El jugador va a recibir un email de aviso.
        </p>
      </DialogContent>
    </Dialog>
  ),
}

/** `defaultOpen` (Radix, sin estado controlado) para mostrar el contenido directamente. */
export const Abierto: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>Abrir diálogo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar reserva</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Esta acción no se puede deshacer. El jugador va a recibir un email de aviso.
        </p>
      </DialogContent>
    </Dialog>
  ),
}

/** Click en el trigger abre el modal; la X (`DialogClose`) lo cierra. */
export const AbrirYCerrar: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Abrir diálogo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar reserva</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Abrir diálogo' }))

    const body = within(canvasElement.ownerDocument.body)
    const dialog = await body.findByRole('dialog')
    await expect(within(dialog).getByText('Cancelar reserva')).toBeVisible()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }))
    await expect(body.queryByRole('dialog')).not.toBeInTheDocument()
  },
}
