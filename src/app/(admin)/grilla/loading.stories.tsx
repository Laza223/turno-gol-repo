import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import GrillaLoading from './loading'

/**
 * Skeleton con la silueta REAL de la grilla (MASTER §5.3 "Espera"): header +
 * tira semanal + grid con eje horario y columnas de canchas. Sin variantes:
 * es el único estado de carga de /grilla.
 */
const meta = {
  title: 'Admin/Grilla/Loading',
  component: GrillaLoading,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof GrillaLoading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
