import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { LayoutDashboard } from 'lucide-react'
import { PageHeader } from './PageHeader'

/**
 * `.page-header-band` es una superficie opaca theme-adaptive propia (gradiente
 * slate + tinte emerald en light, slate-950 + glow en dark) — no depende del
 * fondo de la página, así que no hace falta reproducir el shell admin acá.
 */
const meta = {
  title: 'Admin/Layout/PageHeader',
  component: PageHeader,
  parameters: { layout: 'padded' },
  args: {
    title: 'Inicio',
    subtitle: 'mié 2 de julio',
  },
} satisfies Meta<typeof PageHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ConIcono: Story = {
  args: { icon: <LayoutDashboard className="h-6 w-6" aria-hidden="true" /> },
}

export const SinSubtitulo: Story = {
  args: { subtitle: undefined },
}

export const ConAcciones: Story = {
  args: {
    icon: <LayoutDashboard className="h-6 w-6" aria-hidden="true" />,
    actions: (
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Ir a la grilla
      </button>
    ),
  },
}

/** Título largo: confirma que no rompe el layout ni desborda en mobile. */
export const TituloLargo: Story = {
  args: {
    title: 'Configuración avanzada de políticas de reserva y cancelación',
    subtitle: 'Estos ajustes aplican a todo el complejo',
    icon: <LayoutDashboard className="h-6 w-6" aria-hidden="true" />,
  },
  parameters: { viewport: { defaultViewport: 'mobile-primary' } },
}
