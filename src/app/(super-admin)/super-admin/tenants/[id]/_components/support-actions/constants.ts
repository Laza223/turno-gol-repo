import type { TenantStatus } from '@/modules/billing/billing.types'
import type { SupportActionResult } from '../../actions'

export type Feedback = { kind: 'ok' | 'error'; text: string } | null

/** Ejecuta una Server Action de soporte y vuelca su resultado en el feedback de la sección. */
export type RunAction = (
  fn: () => Promise<SupportActionResult>,
  setFeedback: (f: Feedback) => void,
) => void

/**
 * Firma común de las 7 Server Actions de soporte (`../../actions`): todas son
 * `(input: unknown) => Promise<SupportActionResult>`. Cada sección la recibe
 * por PROP en vez de importar su action directamente — '../../actions' es
 * `'use server'` y arrastra request-context → node:async_hooks, que Vite
 * externaliza en el browser y rompe la story (regla 1 del brief de Storybook).
 * `import type` sí es seguro: se borra en compilación.
 */
export type SupportAction = (input: unknown) => Promise<SupportActionResult>

/** Bolsa de las 7 actions que orquesta SupportActionsPanel, una por sección. */
export type SupportActionsBag = {
  forceStatus: SupportAction
  reactivate: SupportAction
  extendTrial: SupportAction
  changePlan: SupportAction
  updateSettings: SupportAction
  resetPassword: SupportAction
  cancelSubscription: SupportAction
}

export type SupportPanelSettings = {
  requires_deposit: boolean
  deposit_percentage: number
  accepts_cash: boolean
  accepts_transfer: boolean
  accepts_mercadopago: boolean
  allow_online_booking: boolean
  booking_advance_days: number
  auto_complete_minutes: number
}

export type SupportPanelPlan = { id: string; name: string; priceMonthly: number }

export const STATUS_LABELS: Record<TenantStatus, string> = {
  trialing: 'Trial',
  active: 'Activo',
  past_due: 'Pago vencido',
  suspended: 'Suspendido',
  blocked: 'Bloqueado',
  canceled: 'Cancelado',
  churned: 'Churned',
  deleted: 'Eliminado',
}

export const inputCls =
  'h-11 md:h-10 rounded-md border border-border px-3 text-sm focus:border-emerald-600 focus:outline-hidden focus:ring-2 focus:ring-emerald-500'
export const primaryBtn =
  'h-11 md:h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-emerald-700 disabled:opacity-60'
export const destructiveBtn =
  'h-11 md:h-10 rounded-md bg-red-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-red-700 disabled:opacity-60'
