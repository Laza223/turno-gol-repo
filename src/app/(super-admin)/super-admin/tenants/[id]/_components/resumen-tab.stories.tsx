import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import {
  tenantDetail,
  tenantDetailScheduledForDeletion,
  tenantDetailTrialing,
} from '@/test/fixtures/super-admin'
import { ResumenTab } from './resumen-tab'

/**
 * Tab "Resumen" del detalle de tenant. `detail` viene tipado como el
 * `TenantDetail` real del módulo — la story pasa un fixture ESTRUCTURALMENTE
 * compatible (`@/test/fixtures/super-admin`, tipos a mano, ver el comentario
 * ahí) sin importarlo, porque `tenants.service.ts` es server-only.
 */
const meta = {
  title: 'SuperAdmin/TenantDetail/ResumenTab',
  component: ResumenTab,
  parameters: { layout: 'padded' },
  args: {
    detail: tenantDetail(),
    impersonateAction: fn(async () => ({ success: true as const })),
    updateMarketplaceVisibilityAction: fn(async () => ({ success: true as const })),
  },
} satisfies Meta<typeof ResumenTab>

export default meta
type Story = StoryObj<typeof meta>

export const TenantActivo: Story = {}

/** Sin canchas ni MercadoPago conectado — onboarding a medio hacer. */
export const TenantEnTrial: Story = {
  args: { detail: tenantDetailTrialing() },
}

/** Cancelado con eliminación programada — el aviso rojo aparece en "Datos del complejo". */
export const EliminacionProgramada: Story = {
  args: { detail: tenantDetailScheduledForDeletion() },
}
