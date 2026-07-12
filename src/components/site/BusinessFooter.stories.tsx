import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import BusinessFooter from './BusinessFooter'

/**
 * Fondo `#020617` hardcodeado — superficie SIEMPRE oscura (landing B2B
 * `/para-complejos`), independiente del theme del viewer. No hay estados: es
 * estático.
 */
const meta = {
  title: 'Public/BusinessFooter',
  component: BusinessFooter,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof BusinessFooter>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
