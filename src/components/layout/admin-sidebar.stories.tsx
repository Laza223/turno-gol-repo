import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { AdminSidebar } from './admin-sidebar'

/**
 * `usePathname` viene del mock estándar de next/navigation del framework
 * (parameters.nextjs.navigation). El rail desktop es `fixed` — se reproduce
 * en una caja alta para que los 6 espacios más Configuración entren en el canvas.
 * El drawer mobile (`Sheet` de Radix) se controla con `mobileOpen`, sin
 * necesidad de click: `open` es un prop controlado.
 */
const meta = {
  title: 'Admin/Layout/AdminSidebar',
  component: AdminSidebar,
  parameters: {
    layout: 'fullscreen',
    // El "Hoy: $X" del header (B14) pide su propio dato. Declararlo acá evita
    // que estas stories salgan a la red de verdad y midan el placeholder sin
    // querer; el badge tiene sus propias stories en DayTotalBadge.
    fetchMock: [
      {
        match: '/api/admin/day-total',
        json: { data: { date: '2026-08-12', collectedCents: 1250000 } },
      },
    ],
  },
  decorators: [
    (Story) => (
      <div
        style={{ transform: 'translateZ(0)', height: 640 }}
        className="relative isolate overflow-hidden"
      >
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
    await expect(canvas.getAllByRole('link', { name: 'Hoy' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )
  },
}

export const RutaGrilla: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/grilla' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('link', { name: 'Grilla' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )
  },
}

/**
 * D5: el manager no tiene "Hoy" — ahí el ítem no existe para él, así que no se
 * muestra. Configuración es otra cosa: existe y está bloqueada, así que se ve
 * con candado (MASTER §6.8) en vez de desaparecer del DOM.
 */
export const RolManager: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/grilla' } } },
  args: { staffRole: 'manager' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: 'Hoy' })).not.toBeInTheDocument()
    await expect(canvas.getAllByRole('link', { name: 'Grilla' })[0]).toBeInTheDocument()
    // Configuración: visible, no navegable.
    await expect(canvas.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument()
    const locked = canvas.getByRole('button', { name: 'Configuración' })
    await expect(locked).toHaveAttribute('aria-disabled', 'true')
  },
}

/** El espacio Grilla también se enciende desde su pestaña Lista (`/reservas`). */
export const ReservasEnciendeGrilla: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/reservas' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('link', { name: 'Grilla' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )
  },
}

/** Ídem Clientes desde su pestaña Turnos fijos (`/abonados`). */
export const AbonadosEnciendeClientes: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/abonados' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('link', { name: 'Clientes' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )
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
