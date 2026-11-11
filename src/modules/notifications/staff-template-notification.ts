import { createHash } from 'node:crypto'
import type { DbTx } from '@/shared/db/client'
import type { StaffRole } from '@/modules/staff/roles'
import type { EnqueueNotificationParams } from './notification.service'
import type { TemplateName } from './templates'
import { enqueueStaffNotification, isStaffNotificationsEnabled } from './staff-notification.service'

type TemplatePolicy = { title: string; body: string; plan?: boolean; url?: string }

const POLICIES: Partial<Record<TemplateName, TemplatePolicy>> = {
  admin_transfer_expired: {
    title: 'Transferencia no acreditada: turno liberado',
    body: 'La seña no se acreditó a tiempo. Revisá la reserva.',
    url: '/grilla',
  },
  admin_late_payment: {
    title: 'Un pago necesita tu atención',
    body: 'Entró un pago tardío o duplicado. Revisá si corresponde devolverlo.',
  },
  admin_refund_pending_reminder: {
    title: 'Tenés una devolución pendiente',
    body: 'La devolución sigue pendiente. Resolvela con el jugador y registrala en Caja.',
  },
  admin_external_refund_detected: {
    title: 'MercadoPago informó una devolución',
    body: 'Revisá el estado de la devolución y de la reserva en Caja.',
  },
  trial_ending: {
    title: 'Tu prueba está por terminar',
    body: 'Activá el plan para seguir anotando tus turnos, fijos y caja.',
    plan: true,
  },
  trial_expired: {
    title: 'Terminó tu prueba',
    body: 'Pasaste al plan gratis. Tus jugadores te siguen reservando online.',
    plan: true,
  },
  dunning_payment_failed: {
    title: 'No pudimos cobrar tu plan',
    body: 'Revisá tu medio de pago para seguir operando sin cortes.',
    plan: true,
  },
  subscription_suspended: {
    title: 'Tu cuenta quedó en solo lectura',
    body: 'Regularizá el pago para volver a operar.',
    plan: true,
  },
  plan_downgraded_free: {
    title: 'Tu complejo pasó al plan gratis',
    body: 'Tus jugadores te siguen reservando online. Para anotar la noche, activá el plan.',
    plan: true,
  },
  tenant_deletion_warning: {
    title: 'Tus datos están por eliminarse',
    body: 'Revisá el plazo en tu mail y reactivá la cuenta para conservarlos.',
    plan: true,
  },
}

/**
 * Adapta los emisores de mail existentes EN su transacción. El contenido de los
 * templates queda intacto: la política decide canal y destinatarios, no dinero.
 * null conserva el circuito legacy durante el piloto y para otros templates.
 */
export async function enqueueStaffTemplateNotification(
  params: Omit<EnqueueNotificationParams, 'recipientType' | 'recipientId'> & {
    tenantId: string
  },
  tx: DbTx,
  opts?: { onlyRole?: StaffRole },
): Promise<string[] | null> {
  const policy = POLICIES[params.templateName]
  if (!policy || !(await isStaffNotificationsEnabled(params.tenantId, tx))) return null

  // Los pagos usan su id de instancia, no sólo bookingId: dos pagos duplicados
  // distintos sobre el mismo turno son dos incidentes. Otros templates ya
  // incluyen su umbral/fecha de ciclo; el hash evita exponer contenido en la key.
  const explicitKey = params.content.notificationEventKey ?? params.content.refundPaymentId
  const instance =
    typeof explicitKey === 'string'
      ? explicitKey
      : createHash('sha256')
          .update(
            JSON.stringify(Object.entries(params.content).sort(([a], [b]) => a.localeCompare(b))),
          )
          .digest('hex')

  return enqueueStaffNotification(
    {
      tenantId: params.tenantId,
      eventKey: `${params.triggerEvent}:${instance}`,
      type: policy.plan ? `plan.${params.templateName}` : params.triggerEvent,
      audience: policy.plan || opts?.onlyRole === 'admin' ? 'owners' : 'staff',
      policy: policy.plan ? 'email_and_push' : 'push_preferred',
      payload: {
        type: policy.plan ? `plan.${params.templateName}` : params.triggerEvent,
        title: policy.title,
        body: policy.body,
        url: policy.plan ? '/settings/facturacion' : (policy.url ?? '/caja/cuentas'),
      },
      email: { templateName: params.templateName, content: params.content },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    tx,
  )
}
