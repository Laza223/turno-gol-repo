import type { SubscriptionStatus } from '@/modules/billing/billing.types'

/**
 * Estado de la suscripción en criollo. El dueño no tiene por qué saber qué es
 * `past_due`; los 7 estados son los de `SubscriptionStatus` (sin `deleted`).
 * Lo leen Suscripción y la portada de Ajustes.
 */
export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: 'Prueba gratis',
  active: 'Activa',
  past_due: 'Pago pendiente',
  suspended: 'Suspendida',
  blocked: 'Bloqueada',
  canceled: 'Cancelada',
  churned: 'Dada de baja',
}
