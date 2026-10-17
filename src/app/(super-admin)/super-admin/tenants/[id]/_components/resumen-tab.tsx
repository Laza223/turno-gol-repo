import Link from 'next/link'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { surfaceLabel } from '@/components/public/courtFacets'
import { relativeTimeEs } from '@/lib/format'
import { absoluteUrl } from '@/lib/seo/metadata'
import { TONE_TEXT } from '@/lib/status-tone'
import { STAFF_ROLE_LABELS } from '@/modules/staff/roles'
import type { TenantDetail } from '@/modules/super-admin/tenants.service'
import { CourtStatusBadge } from '@/app/(admin)/canchas/components/status-visual'
import { formatDateWithYear, formatShortDateTime } from '../../../_components/sa-format'
import { Card, Dt } from './detail-primitives'
import { ImpersonateButton, type StartImpersonationAction } from './impersonate-button'
import {
  MarketplaceVisibilityToggle,
  type UpdateMarketplaceVisibilityAction,
} from './marketplace-visibility-toggle'
import { ReferralLinkPanel, type GenerateReferralLinkAction } from './referral-link-panel'
import { AssignReferrerPanel, type AssignReferrerAction } from './assign-referrer-panel'

const ROLE_LABELS = { admin: 'Dueño', manager: STAFF_ROLE_LABELS.manager }

const PENALTY_LABELS: Record<string, string> = {
  deposit: 'pierde la seña',
  full: 'se cobra el total',
}

const TH = 'py-2 pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground'

/**
 * Tab "Resumen" del detalle de complejo: datos, actividad, soporte
 * (impersonar), ajustes de reservas, canchas y equipo. Presentacional puro —
 * todo el fetch (`getTenantDetail`) vive en la page; `nowMs` lo pone ella para
 * que "hace 3 h" no dependa del reloj en las stories.
 */
export function ResumenTab({
  detail,
  impersonateAction,
  updateMarketplaceVisibilityAction,
  generateReferralLinkAction,
  assignReferrerAction,
  nowMs,
}: {
  detail: TenantDetail
  impersonateAction: StartImpersonationAction
  updateMarketplaceVisibilityAction: UpdateMarketplaceVisibilityAction
  generateReferralLinkAction: GenerateReferralLinkAction
  assignReferrerAction: AssignReferrerAction
  nowMs: number
}) {
  const { tenant, courts, staff, pulse } = detail
  const s = tenant.settings
  return (
    <div className="space-y-4">
      <Card title="Datos del complejo">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dt label="Dirección">
            {tenant.address}, {tenant.city}, {tenant.province}
          </Dt>
          <Dt label="Teléfono">{tenant.phone}</Dt>
          <Dt label="Email">{tenant.email}</Dt>
          <Dt label="Página pública">
            <Link
              href={`/${tenant.slug}`}
              className="text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
            >
              /{tenant.slug}
            </Link>
          </Dt>
          <Dt label="Alta">{formatShortDateTime(tenant.createdAt)}</Dt>
          <Dt label="Fin de la prueba">{formatDateWithYear(tenant.trialEndsAt)}</Dt>
          <Dt label="MercadoPago (señas)">
            {tenant.mpConnectedAt
              ? `Conectado el ${formatDateWithYear(tenant.mpConnectedAt)}`
              : 'No conectado'}
          </Dt>
          <Dt label="Marketplace público">
            <MarketplaceVisibilityToggle
              tenantId={tenant.id}
              initialVisible={tenant.marketplaceVisible}
              action={updateMarketplaceVisibilityAction}
            />
          </Dt>
          <Dt label="Link de referidos">
            <ReferralLinkPanel
              tenantId={tenant.id}
              initialUrl={tenant.referralCode ? absoluteUrl(`/r/${tenant.referralCode}`) : null}
              action={generateReferralLinkAction}
            />
          </Dt>
          <Dt label="Referido por">
            <AssignReferrerPanel
              tenantId={tenant.id}
              initialReferrerName={tenant.referrerName}
              action={assignReferrerAction}
            />
          </Dt>
          {tenant.scheduledDeletionAt && (
            <Dt label="Eliminación programada">
              <span className={TONE_TEXT.destructive}>
                {formatShortDateTime(tenant.scheduledDeletionAt)}
              </span>
            </Dt>
          )}
          {tenant.description && <Dt label="Descripción">{tenant.description}</Dt>}
        </dl>
      </Card>

      <Card title="Actividad">
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Dt label="Última reserva">
            {pulse.lastBookingAt
              ? relativeTimeEs(pulse.lastBookingAt.toISOString(), nowMs)
              : 'Nunca'}
          </Dt>
          <Dt label="Reservas 7 días">
            <span className="tabular-nums">{pulse.bookings7d}</span>
          </Dt>
          <Dt label="Reservas online 7 días">
            <span className="tabular-nums">{pulse.onlineBookings7d}</span>
          </Dt>
          <Dt label="Jugadores">
            <span className="tabular-nums">{pulse.playersCount}</span>
          </Dt>
        </dl>
      </Card>

      <Card title="Soporte">
        <ImpersonateButton
          tenantId={tenant.id}
          tenantName={tenant.name}
          action={impersonateAction}
        />
      </Card>

      <Card title="Ajustes de reservas">
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
          <Dt label="Cierre automático del turno">{s.auto_complete_minutes} min</Dt>
          <Dt label="Política de cancelación">
            {s.cancellation_policy
              ? `${s.cancellation_policy.hours_before} hs antes · si cancela tarde ${PENALTY_LABELS[s.cancellation_policy.penalty_type] ?? s.cancellation_policy.penalty_type}`
              : '—'}
          </Dt>
          <Dt label="Ausencias">
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
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className={TH}>Nombre</th>
                  <th className={TH}>Superficie</th>
                  <th className={`${TH} text-right`}>Capacidad</th>
                  <th className={TH}>Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm text-foreground">
                {courts.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-4 font-medium">{c.name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {surfaceLabel(c.surfaceType)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{c.capacity}</td>
                    <td className="py-2">
                      {/* El mismo badge que ve el complejo en Configuracion >
                          Canchas. Antes esta tabla tenia su propia receta, con
                          `bg-muted text-muted-foreground` para offline (4.21:1,
                          falla AA) y un verde de la escala `green`, que no es la
                          `emerald` pineada del sistema. Y mostraba el valor
                          crudo del enum en vez del label. */}
                      <CourtStatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Equipo (${staff.length})`}>
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin equipo vinculado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className={TH}>Nombre</th>
                  <th className={TH}>Email</th>
                  <th className={TH}>Rol</th>
                  <th className={TH}>Activo</th>
                  <th className={TH}>Último ingreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm text-foreground">
                {staff.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 pr-4 font-medium">
                      {m.firstName} {m.lastName}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{m.email}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{ROLE_LABELS[m.role]}</td>
                    <td className="py-2 pr-4">{m.isActive ? 'Sí' : 'No'}</td>
                    <td className="py-2 tabular-nums text-muted-foreground">
                      {formatShortDateTime(m.lastLoginAt)}
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
