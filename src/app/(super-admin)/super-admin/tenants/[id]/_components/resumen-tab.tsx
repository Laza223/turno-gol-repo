import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import type { TenantDetail } from '@/modules/super-admin/tenants.service'
import { formatDateArt, formatDateTimeArt } from '../../_components/format'
import { Card, Dt } from './detail-primitives'
import { ImpersonateButton, type StartImpersonationAction } from './impersonate-button'

/**
 * Tab "Resumen" del detalle de tenant: soporte (impersonar), datos del
 * complejo, settings, canchas y staff. Presentacional puro — todo el fetch
 * (`getTenantDetail`) vive en la page.
 */
export function ResumenTab({
  detail,
  impersonateAction,
}: {
  detail: TenantDetail
  impersonateAction: StartImpersonationAction
}) {
  const { tenant, courts, staff } = detail
  const s = tenant.settings
  return (
    <div className="space-y-4">
      <Card title="Soporte">
        <ImpersonateButton
          tenantId={tenant.id}
          tenantName={tenant.name}
          action={impersonateAction}
        />
      </Card>

      <Card title="Datos del complejo">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dt label="Dirección">
            {tenant.address}, {tenant.city}, {tenant.province}
          </Dt>
          <Dt label="Teléfono">{tenant.phone}</Dt>
          <Dt label="Email">{tenant.email}</Dt>
          <Dt label="Creado">{formatDateTimeArt(tenant.createdAt)}</Dt>
          <Dt label="Fin de trial">{formatDateArt(tenant.trialEndsAt)}</Dt>
          <Dt label="MercadoPago (señas)">
            {tenant.mpConnectedAt
              ? `Conectado el ${formatDateArt(tenant.mpConnectedAt)}`
              : 'No conectado'}
          </Dt>
          {tenant.scheduledDeletionAt && (
            <Dt label="Eliminación programada">
              <span className="text-red-600 dark:text-red-400">
                {formatDateTimeArt(tenant.scheduledDeletionAt)}
              </span>
            </Dt>
          )}
          {tenant.description && <Dt label="Descripción">{tenant.description}</Dt>}
        </dl>
      </Card>

      <Card title="Settings">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dt label="Requiere seña">
            {s.requires_deposit ? `Sí (${s.deposit_percentage}%)` : 'No'}
          </Dt>
          <Dt label="Reserva online">{s.allow_online_booking ? 'Habilitada' : 'Deshabilitada'}</Dt>
          <Dt label="Medios de pago">
            {[
              s.accepts_cash ? 'Efectivo' : null,
              s.accepts_transfer ? 'Transferencia' : null,
              s.accepts_mercadopago ? 'MercadoPago' : null,
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
          </Dt>
          <Dt label="Anticipación de reserva">{s.booking_advance_days} días</Dt>
          <Dt label="Duración">{SLOT_DURATION_MINUTES} min</Dt>
          <Dt label="Auto-completar">{s.auto_complete_minutes} min</Dt>
          <Dt label="Política de cancelación">
            {s.cancellation_policy
              ? `${s.cancellation_policy.hours_before} hs antes · penalidad: ${s.cancellation_policy.penalty_type}`
              : '—'}
          </Dt>
          <Dt label="Ausencia (no-show)">
            Softban por reincidencia: 2ª ausencia en 90 días bloquea 14 días para reservar online
          </Dt>
          <Dt label="Onboarding">
            {s.onboarding_completed ? 'Completado' : `Paso ${s.onboarding_step ?? 1}`}
          </Dt>
        </dl>
      </Card>

      <Card title={`Canchas (${courts.length})`}>
        {courts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin canchas cargadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left">
              <thead>
                <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Superficie</th>
                  <th className="py-2 pr-4 text-right">Capacidad</th>
                  <th className="py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-foreground">
                {courts.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-4 font-medium">{c.name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{c.surfaceType}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{c.capacity}</td>
                    <td className="py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          c.status === 'online'
                            ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 ring-green-600/20 dark:ring-green-500/30'
                            : 'bg-muted text-muted-foreground ring-slate-500/20'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Staff (${staff.length})`}>
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin staff vinculado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left">
              <thead>
                <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Rol</th>
                  <th className="py-2 pr-4">Activo</th>
                  <th className="py-2">Último login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-foreground">
                {staff.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 pr-4 font-medium">
                      {m.firstName} {m.lastName}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{m.email}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{m.role}</td>
                    <td className="py-2 pr-4">{m.isActive ? 'Sí' : 'No'}</td>
                    <td className="py-2 tabular-nums text-muted-foreground">
                      {formatDateTimeArt(m.lastLoginAt)}
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
