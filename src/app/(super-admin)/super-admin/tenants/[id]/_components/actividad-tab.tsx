import Link from 'next/link'
import { Pager } from '@/components/ui/pager'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatArs } from '@/lib/format'
import { bookingBadgeVisual } from '@/lib/booking/slot-visual'
import type { TenantActivity } from '@/modules/super-admin/tenants.service'
import { formatDayStr, formatShortDateTime, formatTimeRange } from '../../../_components/sa-format'
import { Card } from './detail-primitives'

const ACTOR_LABELS: Record<TenantActivity['logs'][number]['actorType'], string> = {
  staff: 'Equipo',
  player: 'Jugador',
  system: 'Sistema',
}

/** Las acciones más comunes en castellano; el resto se arma legible a partir del código. */
const ACTION_LABELS: Record<string, string> = {
  'booking.created': 'Reserva creada',
  'booking.canceled': 'Reserva cancelada',
  'booking.canceled_by_admin': 'Reserva cancelada por el complejo',
  'booking.completed': 'Reserva jugada',
  'booking.auto_completed': 'Reserva cerrada automáticamente',
  'booking.edited': 'Reserva editada',
  'booking.rescheduled': 'Reserva reprogramada',
  'booking.marked_no_show': 'Ausencia registrada',
  'booking.no_show_reverted': 'Ausencia revertida',
  'booking.block_released': 'Bloqueo liberado',
  'abonado.created': 'Abonado creado',
  'abonado.canceled': 'Abonado cancelado',
  'abonado.reactivated': 'Abonado reactivado',
  'mp.connected': 'MercadoPago conectado',
  'tenant.mp_disconnected': 'MercadoPago desconectado',
  'tenant.mp_disconnected_detected': 'MercadoPago desconectado (lo detectó TurnoGol)',
  'tenant.activated': 'Complejo activado',
  'tenant.past_due': 'Pago vencido',
  'tenant.suspended': 'Complejo suspendido',
  'tenant.blocked': 'Complejo bloqueado',
  'tenant.canceled': 'Complejo cancelado',
  'tenant.churned': 'Complejo perdido',
  'tenant.reactivated': 'Complejo reactivado',
  'tenant.recovered': 'Complejo recuperado',
  'tenant.trial_expired': 'Prueba vencida',
  'player.banned': 'Jugador bloqueado',
  'player.ban_lifted': 'Bloqueo levantado',
  'subscription.billed_courts_changed': 'Cambio de canchas facturadas',
  'subscription.billed_courts_scheduled': 'Cambio de canchas agendado',
  'subscription.billed_courts_applied': 'Cambio de canchas aplicado',
  'subscription.subscribe_initiated': 'Suscripción iniciada',
  'subscription.reactivate_initiated': 'Reactivación iniciada',
  'support.impersonation.started': 'Soporte entró al panel del complejo',
  'support.impersonation.ended': 'Soporte salió del panel del complejo',
  'support.tenant.created': 'Complejo dado de alta por soporte',
  'support.tenant.trial_extended': 'Prueba extendida por soporte',
  'support.tenant.settings_updated': 'Ajustes editados por soporte',
  'support.tenant.status_forced': 'Estado cambiado por soporte',
  'support.tenant.plan_changed': 'Canchas facturadas cambiadas por soporte',
  'support.tenant.referral_code_generated': 'Link de referidos generado',
  'support.tenant.referrer_assigned': 'Referidor asignado',
  'support.user.password_reset': 'Contraseña reseteada por soporte',
}

function actionLabel(action: string): string {
  const known = ACTION_LABELS[action]
  if (known) return known
  const text = action.replace(/[._]/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const TH = 'py-2 pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground'

/**
 * Pestaña "Historial" del detalle de complejo: eventos paginados (Pager
 * compartido) + últimas 10 reservas. Presentacional puro — la paginación es
 * 100% GET (Link), sin estado de cliente. El query param sigue siendo
 * `tab=actividad` para no romper links viejos.
 */
export function ActividadTab({
  tenantId,
  activity,
}: {
  tenantId: string
  activity: TenantActivity
}) {
  return (
    <div className="space-y-4">
      <Card title={`Historial (${activity.totalLogs})`}>
        {activity.logs.length === 0 ? (
          // `?actPage=99` de un link viejo: hay eventos, lo que no existe es
          // esa página (el título de la tarjeta ya dice cuántos hay).
          <p className="text-sm text-muted-foreground">
            {activity.totalLogs > 0 ? (
              <>
                Esa página no existe.{' '}
                <Link
                  href={`/super-admin/tenants/${tenantId}?tab=actividad&actPage=1`}
                  className="font-medium underline underline-offset-4"
                >
                  Volver al principio
                </Link>
              </>
            ) : (
              'Todavía no hay movimientos.'
            )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>Qué pasó</th>
                  <th className={TH}>Quién</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm text-foreground">
                {activity.logs.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="whitespace-nowrap py-2 pr-4 tabular-nums text-muted-foreground">
                      {formatShortDateTime(log.createdAt)}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="font-medium">{actionLabel(log.action)}</div>
                      {/* La metadata NO se muestra: trae texto libre sobre personas
                          (motivo de un bloqueo o de una cancelación, nombre de un
                          invitado) y el panel no lo exhibe (Ley 25.326). */}
                    </td>
                    <td className="py-2 text-muted-foreground">{ACTOR_LABELS[log.actorType]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          label="Paginación del historial"
          className="mt-4"
          page={activity.page - 1}
          total={activity.totalLogs}
          pageSize={activity.pageSize}
          shown={activity.logs.length}
          hrefFor={(p) => `/super-admin/tenants/${tenantId}?tab=actividad&actPage=${p + 1}`}
        />
      </Card>

      <Card title="Últimas 10 reservas">
        {activity.recentBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin reservas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className={TH}>Día</th>
                  <th className={TH}>Horario</th>
                  <th className={TH}>Cancha</th>
                  <th className={TH}>Origen</th>
                  <th className={TH}>Estado</th>
                  <th className={`${TH} text-right`}>Precio</th>
                  <th className="py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Cargada
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm text-foreground">
                {activity.recentBookings.map((b) => (
                  <tr key={b.id}>
                    {/* `date` es columna DATE (sin hora): llega a medianoche UTC y el día
                        sale del string, sin pasar por la zona horaria. */}
                    <td className="whitespace-nowrap py-2 pr-4 tabular-nums">
                      {formatDayStr(b.date.toISOString().slice(0, 10))}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 tabular-nums">
                      {formatTimeRange(b.timeStart, b.timeEnd)}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{b.courtName ?? '—'}</td>
                    <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">
                      {b.origin === 'online' ? 'Reserva online' : 'Cargada por el complejo'}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge
                        visual={bookingBadgeVisual({
                          status: b.status,
                          type: b.type,
                          depositStatus: b.depositStatus,
                        })}
                      />
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatArs(b.priceSnapshot)}
                    </td>
                    <td className="whitespace-nowrap py-2 tabular-nums text-muted-foreground">
                      {formatShortDateTime(b.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
