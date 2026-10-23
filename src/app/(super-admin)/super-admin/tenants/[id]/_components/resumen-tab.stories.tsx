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
    nowMs: Date.now(),
    impersonateAction: fn(async () => ({ success: true as const })),
    updateMarketplaceVisibilityAction: fn(async () => ({ success: true as const })),
    plusState: {
      kind: 'off' as const,
      pricePerCourtCents: null,
      effectivePerCourtCents: 2_000_000,
      accessUntil: null,
      quote: null,
    },
    setTenantPlusAction: fn(async () => ({ success: true as const })),
    generateReferralLinkAction: fn(async () => ({
      success: true as const,
      url: 'https://turnogol.app/r/AH2K9MZP',
    })),
    assignReferrerAction: fn(async () => ({
      success: true as const,
      referrerName: 'Canchas del Sur',
    })),
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

/** Plus facturado: precio especial y las dos bajas. */
export const PlusFacturado: Story = {
  args: {
    plusState: {
      kind: 'billed',
      pricePerCourtCents: 1_500_000,
      effectivePerCourtCents: 1_500_000,
      accessUntil: null,
      quote: null,
    },
  },
}
