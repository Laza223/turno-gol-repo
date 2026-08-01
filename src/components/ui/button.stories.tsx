import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Button } from './button'

/**
 * El caso más común en la app es un CTA dentro de un form/card (`.card-premium`,
 * fondo `bg-card`) — se reproduce ese contenedor acá. Importa en particular
 * para `variant="link"`: `emerald-700` está calibrado (MASTER §2.4, comentario
 * en globals.css) para 5.5:1 contra blanco, no contra el canvas `bg-background`
 * (slate más oscuro), donde cae a 4.41:1 y no pasa AA — mostrarlo sobre su
 * superficie real evita un falso positivo de axe.
 */
const meta = {
  title: 'Design System/Button',
  component: Button,
  parameters: { layout: 'centered' },
  args: { children: 'Guardar cambios' },
  decorators: [
    (Story) => (
      <div className="rounded-lg bg-card p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Destructive: Story = { args: { variant: 'destructive', children: 'Eliminar cuenta' } }

export const Outline: Story = { args: { variant: 'outline', children: 'Cancelar' } }

export const Secondary: Story = { args: { variant: 'secondary', children: 'Ver detalle' } }

export const Ghost: Story = { args: { variant: 'ghost', children: 'Editar' } }

export const Link: Story = { args: { variant: 'link', children: 'Ver todos los turnos' } }

/** Tamaños disponibles, uno al lado del otro (el default es `default`). */
export const Tamanos: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Chico</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Grande</Button>
      <Button size="icon" aria-label="Cerrar">
        ×
      </Button>
    </div>
  ),
}

/** `isLoading` deshabilita el botón y muestra el spinner branded (`TgBallSpinner`). */
export const Cargando: Story = {
  args: { isLoading: true, children: 'Guardando…' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: 'Guardando…' })
    await expect(button).toBeDisabled()
    await expect(button).toHaveAttribute('aria-disabled', 'true')
  },
}

export const Deshabilitado: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button')).toBeDisabled()
  },
}

/** Confirma que el click dispara el handler cuando el botón está habilitado. */
export const Interactivo: Story = {
  args: { children: 'Confirmar', onClick: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: 'Confirmar' })
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
}
