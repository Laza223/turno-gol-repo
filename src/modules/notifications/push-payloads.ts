/**
 * Payloads de los pushes al admin que llevan el copy armado en el servidor.
 *
 * `title`/`body` viajan en el payload y `public/sw.js` + `PushNotificationManager`
 * los muestran tal cual: un aviso nuevo se define acá y no obliga a tocar las dos
 * ramas de copy del cliente (que ya se habían desfasado entre sí). Funciones puras,
 * sin DB ni cola, para poder testear el texto sin levantar nada.
 */

import type { PushSendJobData } from '@/shared/jobs/definitions'

type Payload = PushSendJobData['payload']

/** Todas las notificaciones de plan apuntan al mismo lugar: es donde se paga. */
const BILLING_URL = '/settings/facturacion'

export const BOOKING_CANCELED_PUSH_TYPE = 'booking.canceled_by_player'

/** Prefijo de los avisos de plan SaaS; el servicio lo usa para armar la dedupeKey. */
export const PLAN_PUSH_PREFIX = 'plan.'

export function bookingCanceledPayload(input: {
  bookingId: string
  courtName?: string
  ymd: string
  dateLabel: string
  timeLabel: string
  /** El jugador canceló dentro de la ventana de cancelación tardía (cuenta como strike). */
  late: boolean
}): Payload {
  const what = input.late ? 'Cancelación tardía' : 'Reserva cancelada'
  return {
    type: BOOKING_CANCELED_PUSH_TYPE,
    bookingId: input.bookingId,
    courtName: input.courtName,
    dateLabel: input.dateLabel,
    timeLabel: input.timeLabel,
    late: input.late,
    title: input.courtName ? `${what} — ${input.courtName}` : what,
    body: [input.dateLabel, input.timeLabel].filter(Boolean).join(' · '),
    // El turno quedó libre: se abre la grilla de ese día, sin `highlight` (no hay fila que resaltar).
    url: input.ymd ? `/grilla?date=${input.ymd}` : '/grilla',
  }
}

export type PlanPushEvent =
  | { event: 'trial_ending'; daysLeft: number }
  | { event: 'trial_expired' }
  | { event: 'payment_failed'; retryDate: string }
  | { event: 'suspended' }
  | { event: 'blocked' }
  | { event: 'deletion_warning'; deletionDate: string; daysRemaining: number }

function planCopy(e: PlanPushEvent): { title: string; body: string } {
  switch (e.event) {
    case 'trial_ending':
      return {
        title:
          e.daysLeft <= 1 ? 'Tu prueba termina mañana' : `Tu prueba termina en ${e.daysLeft} días`,
        body: 'Activá tu plan para seguir usando TurnoGol sin cortes.',
      }
    case 'trial_expired':
      return {
        title: 'Terminó tu prueba',
        body: 'Activá tu plan para seguir usando TurnoGol.',
      }
    case 'payment_failed':
      return {
        title: 'No pudimos cobrar tu plan',
        body: `Vamos a reintentar el ${e.retryDate}. Revisá tu medio de pago.`,
      }
    case 'suspended':
      return {
        title: 'Tu cuenta quedó en solo lectura',
        body: 'No pudimos cobrar el plan. Regularizá el pago para volver a operar.',
      }
    case 'blocked':
      return {
        title: 'Bloqueamos el acceso a tu cuenta',
        body: 'Tus datos siguen guardados. Regularizá el pago para recuperarla.',
      }
    case 'deletion_warning':
      return {
        title: `Tus datos se eliminan en ${e.daysRemaining} días`,
        body: `El ${e.deletionDate} los borramos. Reactivá tu cuenta antes para conservarlos.`,
      }
  }
}

/**
 * `dedupeId` identifica la INSTANCIA del evento (el umbral de aviso, el id del
 * cobro rechazado, el día de la transición): el worker lo usa para no reenviar el
 * mismo aviso si pg-boss reentrega el job. Dos instancias distintas del mismo
 * evento (otro ciclo de mora meses después) llevan otro `dedupeId`.
 */
export function planPushPayload(e: PlanPushEvent, dedupeId: string): Payload {
  return {
    type: `${PLAN_PUSH_PREFIX}${e.event}`,
    dedupeId,
    ...planCopy(e),
    url: BILLING_URL,
  }
}
