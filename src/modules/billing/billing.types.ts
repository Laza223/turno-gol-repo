/**
 * Billing module types. Mirror DB shapes only where needed by the public
 * surface (services + API). Internal-only shapes can stay in the .ts files.
 */

export type TenantStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'blocked'
  | 'canceled'
  | 'churned'
  | 'deleted'

/**
 * Los 8 estados de `tenant_status`, en el orden del FSM (doc4 §2). Vive acá
 * (módulo puro, sin imports de valor) y no en `super-admin/tenants.service.ts`
 * porque ese archivo importa drizzle-orm/@/shared/db/client — cualquier
 * consumidor de solo la lista de estados (ej. `TenantsFilters`, un componente
 * presentacional) arrastraría todo el bundle de DB y rompería en el browser
 * (Storybook: "ReferenceError: Buffer is not defined" desde postgres/src/bytes.js).
 */
export const TENANT_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'suspended',
  'blocked',
  'canceled',
  'churned',
  'deleted',
] as const satisfies readonly TenantStatus[]

export function isTenantStatus(value: string): value is TenantStatus {
  return (TENANT_STATUSES as readonly string[]).includes(value)
}

export type SubscriptionStatus = Exclude<TenantStatus, 'deleted'>

export type BillingCycle = 'monthly' | 'annual'

export type SubscriptionState = {
  tenantId: string
  status: SubscriptionStatus
  planId: string
  planSlug: string
  planName: string
  billingCycle: BillingCycle
  currentPeriodStart: Date
  currentPeriodEnd: Date
  mpSubscriptionId: string | null
  pendingPlanChange: string | null
  pendingChangeAt: Date | null
  canceledAt: Date | null
  cancellationReason: string | null
  scheduledDeletionAt: Date | null
  dunningStartedAt: Date | null
  lastPaymentFailedAt: Date | null
  lastPaymentAt: Date | null
}

export type SubscribeResult = {
  checkoutUrl: string
  preapprovalId: string
}

export type UpgradeResult = {
  checkoutUrl: string
  prorationAmount: number
  preferenceId: string
}

export type DowngradeResult = {
  appliesAt: Date
  targetPlanId: string
}

export type CancelResult = {
  /** When access ends — current_period_end. */
  accessUntil: Date
}
