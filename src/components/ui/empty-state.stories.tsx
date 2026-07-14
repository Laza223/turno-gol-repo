import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { LayoutGrid, Users } from 'lucide-react'
import { Button } from './button'
import { EmptyState } from './empty-state'

/**
 * Card con borde punteado (`border-dashed bg-card`) — es su propio
 * contenedor, se usa directo dentro del área de contenido de cada página
 * (ver CourtList.tsx "Sin canchas todavía"). Sin decorator adicional.
 */
const meta = {
  title: 'Design System/EmptyState',
  component: EmptyState,
  parameters: { layout: 'padded' },
  args: {
    title: 'Sin canchas todavía',
    description: 'Creá la primera para aparecer en búsquedas públicas.',
  },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const ConIcono: Story = { args: { icon: LayoutGrid } }

/** `illustration` (SVG decorativo) tiene precedencia sobre `icon` cuando ambos se pasan. */
export const ConIlustracion: Story = {
  args: {
    icon: LayoutGrid,
    illustration: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="30" className="fill-emerald-500/10 stroke-emerald-500/30" strokeWidth="2" />
        <path d="M20 32h24M32 20v24" className="stroke-emerald-600 dark:stroke-emerald-400" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
}

export const SinIconoNiIlustracion: Story = {
  args: { icon: undefined, illustration: undefined, title: 'No hay resultados' },
}

export const SinDescripcion: Story = { args: { description: undefined } }

/** `action` es un `ReactNode` inyectado — típicamente un `Link` o `Button`. */
export const ConAccion: Story = {
  args: {
    icon: Users,
    title: 'Sin jugadores vinculados',
    description: 'Aparecen cuando alguien reserva online o lo cargás como abonado.',
    action: <Button size="sm">+ Nuevo abonado</Button>,
  },
}
