import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { AdminSidebar } from './admin-sidebar'

/**
 * `usePathname` viene del mock estándar de next/navigation del framework
 * (parameters.nextjs.navigation). El rail desktop es `fixed` — se reproduce
 * en una caja alta para que el nav completo (11 items) sea visible en el canvas.
 * El drawer mobile (`Sheet` de Radix) se controla con `mobileOpen`, sin
 * necesidad de click: `open` es un prop controlado.
 */
const meta = {
  title: 'Admin/Layout/AdminSidebar',
  component: AdminSidebar,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ transform: 'translateZ(0)', height: 640 }} className="relative isolate overflow-hidden">
        <Story />
      </div>
    ),
  ],
  args: {
    tenantName: 'Complejo Fénix',
    mobileOpen: false,
    onClose: fn(),
  },
} satisfies Meta<typeof AdminSidebar>

export default meta
type Story = StoryObj<typeof meta>

export const RutaDashboard: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/dashboard' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('link', { name: 'Inicio' })[0]).toHaveAttribute('aria-current', 'page')
  },
}

export const RutaGrilla: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/grilla' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('link', { name: 'Grilla' })[0]).toHaveAttribute('aria-current', 'page')
  },
}

/** Drawer mobile abierto (`mobileOpen` controlado, sin click). */
export const DrawerMobileAbierto: Story = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/dashboard' } },
    viewport: { defaultViewport: 'mobile-primary' },
  },
  args: { mobileOpen: true },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('dialog')).toBeVisible()
  },
}

export const TenantNameLargo: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/dashboard' } } },
  args: { tenantName: 'Polideportivo y Complejo Deportivo Municipal Belgrano Sur' },
}
