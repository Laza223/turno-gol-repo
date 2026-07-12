import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PlayerBottomNav } from './PlayerBottomNav'

/**
 * `fixed inset-x-0 bottom-0` + `md:hidden`: viewport mobile fijo, contenido
 * en una caja con containing block propio para no tapar el canvas. `usePathname`
 * viene del mock estándar de next/navigation (parameters.nextjs.navigation).
 */
const meta = {
  title: 'Player/PlayerBottomNav',
  component: PlayerBottomNav,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile-primary' },
  },
  decorators: [
    (Story) => (
      <div style={{ transform: 'translateZ(0)', height: 90 }} className="relative isolate overflow-hidden">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlayerBottomNav>

export default meta
type Story = StoryObj<typeof meta>

export const RutaExplorar: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/explorar' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Explorar' })).toHaveAttribute('aria-current', 'page')
  },
}

export const RutaMisReservas: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/mis-reservas' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Reservas' })).toHaveAttribute('aria-current', 'page')
  },
}

export const RutaConfiguracion: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/configuracion' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Cuenta' })).toHaveAttribute('aria-current', 'page')
  },
}
