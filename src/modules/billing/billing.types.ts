/**
 * Billing module types. Mirror DB shapes only where needed by the public
 * surface (services + API). Internal-only shapes can stay in the .ts files.
 */

// Type-only: no arrastra el bundle de payments (mismo motivo que el comentario
// de TENANT_STATUSES más abajo — este archivo tiene que seguir siendo seguro
// de importar desde un componente cliente).
import type { MpPaymentStatus } from '@/modules/payments/payment.types'

export type TenantStatus =
  'trialing' | 'active' | 'past_due' | 'suspended' | 'blocked' | 'canceled' | 'churned' | 'deleted'

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
  /** Canchas sobre las que esta calculado el cobro vigente (migr. 090). */
  billedCourts: number
  /** Canchas a las que pasa el cobro en `pendingChangeAt`. NULL = sin cambio. */
  pendingBilledCourts: number | null
  currentPeriodStart: Date
  currentPeriodEnd: Date
  mpSubscriptionId: string | null
  /** Migr. 078 — NULL = se cobra al email del dueño (`staff_users`). */
  mpPayerEmail: string | null
  /** @deprecated migr. 090/091 — la reemplaza `pendingBilledCourts`. */
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

/**
 * Resultado de cambiar la cantidad de canchas facturadas.
 *
 * Reemplaza a `UpgradeResult`/`DowngradeResult`, que existian cuando subir o
 * bajar significaba saltar de banda. Con precio por cancha ningun cambio se
 * cobra prorrateado (decision 2026-09-17, P4): o se aplica en el acto porque
 * todavia no se cobro nada (trial), o se agenda para el proximo ciclo.
 */
export type ChangeBilledCourtsResult = {
  /** true = ya quedo aplicado (trial). false = agendado para `appliesAt`. */
  applied: boolean
  /** Cuando empieza a regir. `null` si ya rige. */
  appliesAt: Date | null
  billedCourts: number
  previousBilledCourts: number
}

export type CancelResult = {
  /** When access ends — current_period_end. */
  accessUntil: Date
}

/** Plan activo, para selectores (activación de plan / cambio de plan). */
export type PlanSummary = {
  id: string
  slug: string
  name: string
  maxCourts: number | null
  /** Centavos ARS/mes. */
  priceMonthly: number
  /** Centavos ARS/mes pagando el ciclo anual. */
  priceAnnual: number
  /** Migr. 090 — precio por cancha. NULL en las filas legacy inactivas. */
  priceFirstCourtCents: number | null
  priceExtraCourtCents: number | null
  /** Descuento del ciclo anual en basis points. 1000 = 10%. */
  annualDiscountBps: number | null
}

/**
 * Un cobro recurrente de la suscripción SaaS (doc15 §5.8, `GET
 * /api/billing/invoices`). Se lee EN VIVO de MercadoPago
 * (`billing.service.ts:listInvoices`) — no hay tabla local: `external_reference`
 * del preapproval es el `tenantId` (`createPreapproval`) y MP lo propaga a cada
 * pago recurrente que cuelga de él (confirmado contra producción,
 * `docs/superpowers/specs/2026-08-20-reconcile-subscriptions-design.md` §7), así
 * que `searchPaymentsByReference(tenantId)` ya trae el historial completo sin
 * duplicar estado que se puede desincronizar. Deja afuera a propósito los pagos
 * de upgrade (proraeo): esos usan `saas-upgrade:<tenantId>:<planId>` como
 * referencia (`buildSaasUpgradeRef`), no el tenantId pelado.
 */
export type InvoiceEntry = {
  mpPaymentId: string
  status: MpPaymentStatus
  /** Centavos ARS. */
  amount: number
  /** `null` si MP no mandó `date_created` en el resultado de búsqueda. */
  date: Date | null
}
