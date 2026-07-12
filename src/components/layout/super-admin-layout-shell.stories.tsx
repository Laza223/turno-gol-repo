import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { SuperAdminLayoutShell } from './super-admin-layout-shell'

/** `signOut` es una Server Action `() => Promise<never>` — mock que nunca resuelve. */
const NEVER_RESOLVES = fn(() => new Promise<never>(() => {}))

const meta = {
  title: 'SuperAdmin/Layout/SuperAdminLayoutShell',
  component: SuperAdminLayoutShell,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/super-admin' } },
  },
  args: {
    userEmail: 'duenio@turnogol.app',
    adminName: 'Lázaro Feijoo',
    signOut: NEVER_RESOLVES,
    children: (
      <div className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
        Contenido del panel
      </div>
    ),
  },
} satisfies Meta<typeof SuperAdminLayoutShell>

export default meta
type Story = StoryObj<typeof meta>

export const RutaDashboard: Story = {}

export const RutaTenants: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/super-admin/tenants' } } },
}

/** Drawer mobile abierto (estado interno `mobileOpen`, sin prop expuesta). */
export const DrawerMobileAbierto: Story = {
  parameters: { viewport: { defaultViewport: 'mobile-primary' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Abrir menú' }))
    await expect(canvas.getAllByText('TurnoGol — SuperAdmin').length).toBeGreaterThan(1)
  },
}
