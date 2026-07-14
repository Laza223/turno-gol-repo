import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import SiteFooter from './SiteFooter'

/** Footer del portal del jugador — theme-adaptive vía tokens, estático. */
const meta = {
  title: 'Player/SiteFooter',
  component: SiteFooter,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SiteFooter>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
