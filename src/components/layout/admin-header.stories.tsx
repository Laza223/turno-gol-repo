import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { AdminHeader } from './admin-header'

/**
 * `fixed inset-x-0 top-0`: un wrapper `position: relative` normal NO lo
 * contiene. Se fuerza un containing block nuevo con `transform` + una caja de
 * altura fija, así el header no tapa los controles del canvas de Storybook.
 */
const meta = {
  title: 'Admin/Layout/AdminHeader',
  component: AdminHeader,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div
        style={{ transform: 'translateZ(0)', height: 90 }}
        className="relative isolate overflow-hidden"
      >
        <Story />
      </div>
    ),
  ],
  args: {
    userEmail: 'marcelo@complejofenix.com.ar',
    onSignOut: fn(),
  },
} satisfies Meta<typeof AdminHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const UserEmailLargo: Story = {
  args: { userEmail: 'julieta.dominguez.belgrano@complejofenix.com.ar' },
}

/**
 * Fase 4: en mobile ya no hay hamburguesa (la navegación primaria es
 * `AdminBottomNav`). Lo que queda a la izquierda es la marca, linkeando al
 * espacio "casa" del rol.
 */
export const MarcaEnMobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile-primary' },
    nextjs: { appDirectory: true },
  },
  args: { homeHref: '/dashboard' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Abrir menú' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('link')).toHaveAttribute('href', '/dashboard')
  },
}

export const CierraSesion: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Cerrar sesión' }))
    await expect(args.onSignOut).toHaveBeenCalledOnce()
  },
}
