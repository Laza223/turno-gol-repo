import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { MapPin } from 'lucide-react'
import { withPortalGlass } from '../../../.storybook/decorators/with-portal-glass'
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

/**
 * Portal de vidrio (decisión 2026-11-13): las píldoras del portal sobre su luz y una foto. 52 px el
 * principal y 44 px el resto; el foco es un contorno verde de 2 px, sin la banda del `ring-offset`.
 * El panel no las usa.
 */
export const PortalPildoras: Story = {
  decorators: [withPortalGlass()],
  render: () => (
    <div className="flex max-w-md flex-wrap items-center gap-3">
      <Button variant="pill" size="pill">
        Reservar
      </Button>
      <Button variant="pill-glass" size="pill">
        Ver horarios
      </Button>
      <Button variant="pill-danger" size="pill-sm">
        Cancelar turno
      </Button>
      <Button variant="pill-link" size="pill-sm">
        <MapPin aria-hidden />
        Cómo llegar
      </Button>
      <Button variant="pill-chip" size="pill-sm" aria-pressed>
        Fútbol 5
      </Button>
      <Button variant="pill-chip" size="pill-sm" aria-pressed={false}>
        Fútbol 7
      </Button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const principal = canvas.getByRole('button', { name: 'Reservar' })
    await expect(Math.round(principal.getBoundingClientRect().height)).toBe(52)
    for (const name of ['Cancelar turno', 'Cómo llegar', 'Fútbol 5', 'Fútbol 7']) {
      const button = canvas.getByRole('button', { name })
      await expect(Math.round(button.getBoundingClientRect().height)).toBe(44)
    }
    // El chip elegido pasa al verde; el otro sigue en vidrio interior.
    const elegido = getComputedStyle(canvas.getByRole('button', { name: 'Fútbol 5' }))
    const otro = getComputedStyle(canvas.getByRole('button', { name: 'Fútbol 7' }))
    await expect(elegido.backgroundImage).toContain('gradient')
    await expect(otro.backgroundImage).toBe('none')
    await userEvent.tab()
    await expect(principal).toHaveFocus()
    await expect(getComputedStyle(principal).outlineStyle).toBe('solid')
    await expect(getComputedStyle(principal).outlineWidth).toBe('2px')
  },
}
