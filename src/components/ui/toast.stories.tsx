import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './toast'

/**
 * @radix-ui/react-toast puro. Necesita `ToastProvider` + `ToastViewport`
 * alrededor (ver toaster.tsx, el mount-point real de la app) — sin eso no
 * hay contexto donde `Toast` pueda registrarse. `duration={Infinity}` para
 * que el auto-dismiss no se dispare a mitad del a11y scan.
 *
 * El preview global YA monta un `<Toaster/>` (con su propio `ToastViewport`,
 * `aria-label="Notifications (F8)"` por default de Radix) en cada story —
 * es lo que hace funcionar `toast()` desde un `play`. El `ToastViewport` de
 * este decorator es OTRO, necesario porque Toast exige un `ToastProvider`
 * ancestro (no alcanza con el que ya existe como hermano de `<Story/>`);
 * `label` distingue los dos landmarks `role="region"` para que axe
 * (`landmark-unique`) no los vea como duplicados.
 */
const meta = {
  title: 'Design System/Toast',
  component: Toast,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <ToastProvider swipeDirection="right">
        <Story />
        <ToastViewport
          className="static w-80 max-w-full p-0"
          label="Toast de ejemplo (Storybook)"
        />
      </ToastProvider>
    ),
  ],
} satisfies Meta<typeof Toast>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { open: true, duration: Infinity },
  render: (args) => (
    <Toast {...args}>
      <div className="grid gap-1">
        <ToastTitle>Cambios guardados</ToastTitle>
      </div>
      <ToastClose />
    </Toast>
  ),
}

export const Success: Story = {
  args: { open: true, duration: Infinity, variant: 'success' },
  render: (args) => (
    <Toast {...args}>
      <div className="grid gap-1">
        <ToastTitle>Reserva confirmada</ToastTitle>
        <ToastDescription>Le avisamos al jugador por email.</ToastDescription>
      </div>
      <ToastClose />
    </Toast>
  ),
}

export const Destructive: Story = {
  args: { open: true, duration: Infinity, variant: 'destructive' },
  render: (args) => (
    <Toast {...args}>
      <div className="grid gap-1">
        <ToastTitle>No se pudo guardar</ToastTitle>
        <ToastDescription>Revisá tu conexión e intentá de nuevo.</ToastDescription>
      </div>
      <ToastClose />
    </Toast>
  ),
}

export const SoloTitulo: Story = {
  args: { open: true, duration: Infinity },
  render: (args) => (
    <Toast {...args}>
      <div className="grid gap-1">
        <ToastTitle>Movimiento registrado</ToastTitle>
      </div>
      <ToastClose />
    </Toast>
  ),
}

/**
 * El botón de cierre despacha el dismiss (Radix `onOpenChange(false)`) sobre
 * estado local controlado. El swipe-to-dismiss (`data-swipe`) depende de un
 * gesto de arrastre con puntero real — no se simula acá; el cierre por click
 * ya cubre el mismo camino de dismiss que usa `dismiss(id)` en toaster.tsx.
 */
export const Cerrable: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(true)
      if (!open) {
        return (
          <button
            type="button"
            className="text-sm text-muted-foreground underline"
            onClick={() => setOpen(true)}
          >
            Reabrir toast
          </button>
        )
      }
      return (
        <Toast open={open} onOpenChange={setOpen} duration={Infinity}>
          <div className="grid gap-1">
            <ToastTitle>Cambios guardados</ToastTitle>
          </div>
          <ToastClose />
        </Toast>
      )
    }
    return <Demo />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cerrar' }))
    await expect(canvas.getByRole('button', { name: 'Reabrir toast' })).toBeVisible()
  },
}
