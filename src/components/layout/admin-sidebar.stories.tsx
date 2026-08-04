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
  // requiresAdmin (D5: "Hoy" es solo del admin) — sin staffRole='admin' el ítem no renderiza.
  args: { staffRole: 'admin' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('link', { name: 'Hoy' })[0]).toHaveAttribute('aria-current', 'page')
  },
}

export const RutaGrilla: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/grilla' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('link', { name: 'Grilla' })[0]).toHaveAttribute('aria-current', 'page')
  },
}

/** D5: el manager no tiene "Hoy" — el ítem no debe aparecer en su nav. */
export const RolManager: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/grilla' } } },
  args: { staffRole: 'manager' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: 'Hoy' })).not.toBeInTheDocument()
    await expect(canvas.getAllByRole('link', { name: 'Grilla' })[0]).toBeInTheDocument()
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
    // Se asertea el CONTENIDO del drawer, no el shell del diálogo. Un
    // `expect(await findByRole('dialog')).toBeVisible()` engancha el nodo apenas monta
    // —- sin hijos todavía y a mitad de la animación de entrada de Radix— y `toBeVisible()`
    // lo lee como oculto: flake garantizado bajo carga. Un link de la navegación solo
    // existe si el drawer está montado y renderizado. (Misma clase de bug que ya mordió en
    // BookingActions.stories.tsx.)
    const drawer = within(await body.findByRole('dialog'))
    await expect(await drawer.findByRole('link', { name: 'Grilla' })).toBeInTheDocument()
  },
}

export const TenantNameLargo: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/dashboard' } } },
  args: { tenantName: 'Polideportivo y Complejo Deportivo Municipal Belgrano Sur' },
}
