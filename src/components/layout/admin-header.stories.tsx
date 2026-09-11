import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { AdminHeader } from './admin-header'

/**
 * `fixed inset-x-0 top-0`: un wrapper `position: relative` normal NO lo
 * contiene. Se fuerza un containing block nuevo con `transform` + una caja de
 * altura fija, así el header no tapa los controles del canvas de Storybook.
 */
const meta = {
  title: 'Admin/Layout/AdminHeader',
  component: AdminHeader,
  parameters: {
    layout: 'fullscreen',
  },
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
    tenantName: 'Complejo Fénix',
  },
} satisfies Meta<typeof AdminHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const TenantNameLargo: Story = {
  args: { tenantName: 'Polideportivo y Complejo Deportivo Municipal Belgrano Sur' },
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
    await expect(canvas.getByRole('link', { name: /TurnoGol/i })).toHaveAttribute(
      'href',
      '/dashboard',
    )
  },
}
