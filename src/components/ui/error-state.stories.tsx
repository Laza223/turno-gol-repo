import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Home, LayoutDashboard } from 'lucide-react'
import { ErrorState } from './error-state'

/**
 * Cada variant reproduce su contenedor real: `full` es el error.tsx raíz
 * (`min-h-dvh`, src/app/error.tsx), `contained` es el error boundary del
 * admin (dentro del shell con sidebar, src/app/(admin)/error.tsx),
 * `inline` es una card acotada dentro de otra vista (sin wrapper propio).
 */
const meta = {
  title: 'Design System/ErrorState',
  component: ErrorState,
  parameters: { layout: 'fullscreen' },
  args: {
    title: 'Algo salió mal',
    description:
      'Tuvimos un problema inesperado. Ya quedó registrado y lo estamos revisando. Podés reintentar en unos segundos o volver al inicio.',
  },
} satisfies Meta<typeof ErrorState>

export default meta
type Story = StoryObj<typeof meta>

/** Root error.tsx (src/app/error.tsx): toma toda la pantalla. */
export const Full: Story = {
  args: {
    variant: 'full',
    onRetry: fn(),
    secondaryHref: '/',
    secondaryLabel: 'Volver al inicio',
    secondaryIcon: Home,
  },
}

/** Admin error.tsx: vive dentro del shell (sidebar se mantiene), min-h menor. */
export const Contained: Story = {
  parameters: { layout: 'padded' },
  args: {
    variant: 'contained',
    title: 'Error en el panel de administración',
    description:
      'No pudimos cargar esta sección. El equipo ya fue notificado. Probá recargar; si el problema persiste, volvé al dashboard.',
    onRetry: fn(),
    secondaryHref: '/dashboard',
    secondaryLabel: 'Ir al dashboard',
    secondaryIcon: LayoutDashboard,
  },
}

/** Card compacta con borde rojo, embebida dentro de otra vista (sin overlay ni min-h). */
export const Inline: Story = {
  parameters: { layout: 'padded' },
  args: {
    variant: 'inline',
    title: 'No se pudo cargar el reporte',
    onRetry: fn(),
  },
}

export const ConDigest: Story = {
  parameters: { layout: 'padded' },
  args: { variant: 'contained', digest: 'a1b2c3d4' },
}

/** Reintentar dispara `onRetry` (el `reset()` de Next para ese error boundary). */
export const Reintentar: Story = {
  parameters: { layout: 'padded' },
  args: { variant: 'contained', onRetry: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Reintentar' }))
    await expect(args.onRetry).toHaveBeenCalledOnce()
  },
}
