import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { planSummaries, supportPanelSettings } from '@/test/fixtures/super-admin'
import { SupportActionsPanel } from './support-actions-panel'

/**
 * Panel completo: 7 Server Actions entran por prop en `actions` (ver la nota
 * en support-actions/constants.ts) — un `sb.mock()` de '../../actions' NO
 * sirve, ese módulo es `'use server'` y arrastra node:async_hooks.
 * `router.refresh()` (next/navigation) queda mockeado por el framework.
 */
const plans = planSummaries()
const settings = supportPanelSettings()

function mockActions(overrides: Partial<Parameters<typeof SupportActionsPanel>[0]['actions']> = {}) {
  const ok = (message: string) => fn(async () => ({ success: true as const, message }))
  return {
    forceStatus: ok("Estado forzado: 'active' → 'past_due'."),
    reactivate: ok("Complejo reactivado (estaba 'suspended')."),
    extendTrial: ok('Trial extendido 7 días (vence 2026-03-21).'),
    changePlan: ok('Plan cambiado sin cobro.'),
    updateSettings: ok('Settings actualizados.'),
    resetPassword: ok('Contraseña temporal: TG-a1b2c3d4e5 — dictásela al titular.'),
    cancelSubscription: ok('Suscripción cancelada. Acceso hasta 2026-04-14.'),
    ...overrides,
  }
}

const meta = {
  title: 'SuperAdmin/TenantDetail/SupportActionsPanel',
  component: SupportActionsPanel,
  parameters: {
    layout: 'padded',
    // El panel llama router.refresh() en cada acción exitosa (ver support-actions-panel.tsx).
    nextjs: { appDirectory: true, navigation: { pathname: '/super-admin/tenants/1?tab=acciones' } },
  },
  args: {
    tenantId: '00000000-0000-4000-8000-000000000001',
    tenantName: 'Complejo Fénix',
    status: 'active',
    forceableTargets: ['past_due'],
    destructiveTargets: ['blocked', 'deleted'],
    canReactivate: false,
    isTrialing: false,
    hasSubscription: true,
    currentPlanId: plans[1]!.id,
    plans,
    settings,
    actions: mockActions(),
  },
} satisfies Meta<typeof SupportActionsPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Tenant activo con suscripción: no puede reactivar (ya está activo), sí cambiar plan/forzar estado. */
export const TenantActivo: Story = {}

/** Tenant en trial, sin suscripción todavía: ExtendTrial es la única acción con sentido de negocio real. */
export const TenantEnTrial: Story = {
  args: {
    status: 'trialing',
    forceableTargets: ['active'],
    canReactivate: false,
    isTrialing: true,
    hasSubscription: false,
    currentPlanId: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('El complejo no está en trial — no aplica.')).not.toBeInTheDocument()
    // Sin suscripción: ChangePlan y Cancel muestran el mismo aviso de "no aplica".
    await expect(canvas.getAllByText(/no tiene suscripción registrada/i).length).toBeGreaterThan(0)
  },
}

/** Tenant suspendido: aparece la sección "Reactivar" (canReactivate) además de Forzar estado. */
export const TenantSuspendido: Story = {
  args: {
    status: 'suspended',
    forceableTargets: ['active', 'blocked'],
    canReactivate: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Reactivar complejo' })).toBeInTheDocument()
  },
}

/** Extender trial de punta a punta: el resultado de una sección no pisa el de las demás. */
export const ExtenderTrialDePuntaAPunta: Story = {
  args: {
    status: 'trialing',
    forceableTargets: ['active'],
    isTrialing: true,
    hasSubscription: false,
    currentPlanId: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trialSection = canvas.getByRole('heading', { name: 'Extender trial' }).closest('section')!
    await userEvent.click(within(trialSection).getByRole('button', { name: 'Extender trial' }))
    await expect(await within(trialSection).findByText(/trial extendido 7 días/i)).toBeInTheDocument()
  },
}
