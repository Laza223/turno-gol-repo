import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { ImpersonationBanner } from './impersonation-banner'
import { AdminLayoutShell } from './admin-layout-shell'

/**
 * `usePathname` decide `isGrilla` (layout full-height sin scroll en /grilla) —
 * viene del mock estándar de next/navigation. `signOut` es una Server Action
 * tipada `() => Promise<never>`: acá un mock que nunca resuelve (nadie espera
 * su retorno en el layout — el botón dispara un `startTransition`).
 */
const NEVER_RESOLVES = fn(() => new Promise<never>(() => {}))

const meta = {
  title: 'Admin/Layout/AdminLayoutShell',
  component: AdminLayoutShell,
  parameters: { layout: 'fullscreen' },
  args: {
    tenantName: 'Complejo Fénix',
    userEmail: 'marcelo@complejofenix.com.ar',
    signOut: NEVER_RESOLVES,
    children: (
      <div className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
        Contenido de la página
      </div>
    ),
  },
} satisfies Meta<typeof AdminLayoutShell>

export default meta
type Story = StoryObj<typeof meta>

export const Trialing: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/dashboard' } } },
  args: {
    tenantStatus: 'trialing',
    trialEndsAt: new Date('2026-03-23').toISOString(),
    periodEnd: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/período de prueba/i)).toBeInTheDocument()
  },
}

export const PastDue: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/dashboard' } } },
  args: {
    tenantStatus: 'past_due',
    trialEndsAt: null,
    periodEnd: new Date('2026-03-16').toISOString(),
  },
}

export const Suspended: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/dashboard' } } },
  args: { tenantStatus: 'suspended', trialEndsAt: null, periodEnd: null },
}

/** Activo: sin banner de estado. */
export const Activo: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/dashboard' } } },
  args: { tenantStatus: 'active', trialEndsAt: null, periodEnd: null },
}

/** /grilla: layout full-height sin scroll de página (la grilla scrollea internamente). */
export const RutaGrilla: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/grilla' } } },
  args: { tenantStatus: 'active', trialEndsAt: null, periodEnd: null },
}

/** Sesión de super admin impersonando el tenant — banner rojo pegado bajo el header. */
export const ConImpersonacion: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/dashboard' } } },
  args: {
    tenantStatus: 'active',
    trialEndsAt: null,
    periodEnd: null,
    impersonationBanner: (
      <ImpersonationBanner tenantName="Complejo Fénix" action={fn(async () => {})} />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(/Impersonando/)
  },
}
