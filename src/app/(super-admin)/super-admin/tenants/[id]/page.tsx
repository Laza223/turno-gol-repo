import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { requireSystemAdmin } from '@/modules/auth/system-admin.guards'
import {
  getTenantActivity,
  getTenantDetail,
  listActivePlans,
  type TenantActivity,
  type TenantDetail,
  type PlanSummary,
} from '@/modules/super-admin/tenants.service'
import { DESTRUCTIVE_TARGET_STATUSES } from '@/modules/super-admin/support.schema'
import {
  FORCEABLE_TRANSITIONS,
  REACTIVATABLE_STATUSES,
} from '@/modules/super-admin/support.service'
import { formatArs } from '@/lib/format'
import { TenantStatusBadge } from '../_components/status-badge'
import { formatDateArt, formatDateTimeArt } from '../_components/format'
import {
  SupportActionsPanel,
  type SupportPanelSettings,
} from './_components/support-actions-panel'
import { ImpersonateButton } from './_components/impersonate-button'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TABS = ['resumen', 'suscripcion', 'actividad', 'acciones'] as const
type Tab = (typeof TABS)[number]

const TAB_LABELS: Record<Tab, string> = {
  resumen: 'Resumen',
  suscripcion: 'Suscripción',
  actividad: 'Actividad',
  acciones: 'Acciones',
}

const ACTIVITY_PAGE_SIZE = 25

function parseTab(raw: string | undefined): Tab {
  return (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'resumen'
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : 1
}

function Dt({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default async function SuperAdminTenantDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string; actPage?: string }
}) {
  await requireSystemAdmin()

  if (!UUID_RE.test(params.id)) notFound()
  const detail = await getTenantDetail(params.id)
  if (!detail) notFound()

  const tab = parseTab(searchParams.tab)
  const plansList = await listActivePlans()

  const activity =
    tab === 'actividad'
      ? await getTenantActivity(params.id, {
          page: parsePage(searchParams.actPage),
          pageSize: ACTIVITY_PAGE_SIZE,
        })
      : null

  const { tenant } = detail

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/super-admin/tenants"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            ← Volver a tenants
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold text-foreground">
            {tenant.name}
            <TenantStatusBadge status={tenant.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {tenant.slug} · {tenant.email}
          </p>
        </div>
      </div>

      <nav aria-label="Secciones del tenant" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/super-admin/tenants/${tenant.id}?tab=${t}`}
            aria-current={tab === t ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-150 ${
              tab === t
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
            }`}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </nav>

      {tab === 'resumen' && <ResumenTab detail={detail} />}
      {tab === 'suscripcion' && <SuscripcionTab detail={detail} plans={plansList} />}
      {tab === 'actividad' && activity && (
        <ActividadTab tenantId={tenant.id} activity={activity} />
      )}
      {tab === 'acciones' && <AccionesTab detail={detail} plans={plansList} />}
    </div>
  )
}

// ─── Resumen ─────────────────────────────────────────────────────────────────

function ResumenTab({ detail }: { detail: TenantDetail }) {
  const { tenant, courts, staff } = detail
  const s = tenant.settings
  return (
    <div className="space-y-4">
      <Card title="Soporte">
        <ImpersonateButton tenantId={tenant.id} tenantName={tenant.name} />
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
              <span className="text-red-600 dark:text-red-400">{formatDateTimeArt(tenant.scheduledDeletionAt)}</span>
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
          <Dt label="Ausencia (no-show)">Genera deuda (bloqueo hasta saldar)</Dt>
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

// ─── Suscripción ─────────────────────────────────────────────────────────────

function SuscripcionTab({ detail, plans }: { detail: TenantDetail; plans: PlanSummary[] }) {
  const sub = detail.subscription
  if (!sub) {
    return (
      <Card title="Suscripción">
        <p className="text-sm text-muted-foreground">
          El complejo no tiene fila en tenant_subscriptions (todavía no inició la
          suscripción SaaS).
        </p>
      </Card>
    )
  }
  const pendingPlanName = sub.pendingPlanChange
    ? plans.find((p) => p.id === sub.pendingPlanChange)?.name ?? sub.pendingPlanChange
    : null
  return (
    <div className="space-y-4">
      <Card title="Estado de la suscripción">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dt label="Estado">
            <TenantStatusBadge status={sub.status} />
          </Dt>
          <Dt label="Plan">
            {sub.planName ?? sub.planId}
            {sub.priceMonthly != null && (
              <span className="text-muted-foreground"> · {formatArs(sub.priceMonthly)}/mes</span>
            )}
          </Dt>
          <Dt label="Ciclo">{sub.billingCycle === 'annual' ? 'Anual' : 'Mensual'}</Dt>
          <Dt label="Período actual">
            {formatDateArt(sub.currentPeriodStart)} → {formatDateArt(sub.currentPeriodEnd)}
          </Dt>
          <Dt label="Preapproval MP">{sub.mpSubscriptionId ?? '—'}</Dt>
          {pendingPlanName && (
            <Dt label="Cambio de plan pendiente">
              {pendingPlanName}
              {sub.pendingChangeAt
                ? ` (aplica ${formatDateArt(sub.pendingChangeAt)})`
                : ' (espera pago de proración)'}
            </Dt>
          )}
        </dl>
      </Card>

      <Card title="Dunning y pagos">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dt label="Último pago">{formatDateTimeArt(sub.lastPaymentAt)}</Dt>
          <Dt label="Último pago fallido">{formatDateTimeArt(sub.lastPaymentFailedAt)}</Dt>
          <Dt label="Dunning iniciado">{formatDateTimeArt(sub.dunningStartedAt)}</Dt>
          {sub.canceledAt && (
            <Dt label="Cancelada">
              {formatDateTimeArt(sub.canceledAt)}
              {sub.cancellationReason && (
                <span className="text-muted-foreground"> — “{sub.cancellationReason}”</span>
              )}
            </Dt>
          )}
          {sub.scheduledDeletionAt && (
            <Dt label="Eliminación programada">
              <span className="text-red-600 dark:text-red-400">{formatDateTimeArt(sub.scheduledDeletionAt)}</span>
            </Dt>
          )}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          No existe tabla de pagos SaaS en v1: el historial se reduce a los anclajes de
          la suscripción (último pago / fallo / dunning). Los eventos completos están en
          la pestaña Actividad (audit trail).
        </p>
      </Card>
    </div>
  )
}

// ─── Actividad ───────────────────────────────────────────────────────────────

function ActividadTab({ tenantId, activity }: { tenantId: string; activity: TenantActivity }) {
  const totalPages = Math.max(1, Math.ceil(activity.totalLogs / activity.pageSize))
  return (
    <div className="space-y-4">
      <Card title={`Audit trail (${activity.totalLogs})`}>
        {activity.logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin eventos de auditoría.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Acción</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">Recurso</th>
                  <th className="py-2">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-foreground">
                {activity.logs.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="whitespace-nowrap py-2 pr-4 tabular-nums text-muted-foreground">
                      {formatDateTimeArt(log.createdAt)}
                    </td>
                    <td className="py-2 pr-4 font-medium">{log.action}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{log.actorType}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{log.resourceType}</td>
                    <td className="max-w-md py-2">
                      {log.metadata ? (
                        <code className="block truncate text-xs text-muted-foreground">
                          {JSON.stringify(log.metadata)}
                        </code>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <nav
            aria-label="Paginación del audit trail"
            className="mt-4 flex items-center justify-between text-sm"
          >
            <span className="text-muted-foreground">
              Página {activity.page} de {totalPages}
            </span>
            <div className="flex gap-2">
              {activity.page > 1 ? (
                <Link
                  href={`/super-admin/tenants/${tenantId}?tab=actividad&actPage=${activity.page - 1}`}
                  className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-accent"
                >
                  Anterior
                </Link>
              ) : (
                <span className="rounded-md border border-border px-3 py-1.5 text-muted-foreground/40">
                  Anterior
                </span>
              )}
              {activity.page < totalPages ? (
                <Link
                  href={`/super-admin/tenants/${tenantId}?tab=actividad&actPage=${activity.page + 1}`}
                  className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-accent"
                >
                  Siguiente
                </Link>
              ) : (
                <span className="rounded-md border border-border px-3 py-1.5 text-muted-foreground/40">
                  Siguiente
                </span>
              )}
            </div>
          </nav>
        )}
      </Card>

      <Card title="Últimas 10 reservas">
        {activity.recentBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin reservas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Horario</th>
                  <th className="py-2 pr-4">Cancha</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4 text-right">Precio</th>
                  <th className="py-2">Creada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-foreground">
                {activity.recentBookings.map((b) => (
                  <tr key={b.id}>
                    {/* date es columna DATE (sin tz): se muestra tal cual, sin conversión ART. */}
                    <td className="py-2 pr-4 tabular-nums">{b.date.toISOString().slice(0, 10)}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {b.timeStart.slice(0, 5)}–{b.timeEnd.slice(0, 5)}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{b.courtName ?? '—'}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{b.status}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatArs(b.priceSnapshot)}
                    </td>
                    <td className="py-2 tabular-nums text-muted-foreground">
                      {formatDateTimeArt(b.createdAt)}
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

// ─── Acciones ────────────────────────────────────────────────────────────────

function AccionesTab({ detail, plans }: { detail: TenantDetail; plans: PlanSummary[] }) {
  const { tenant, subscription } = detail
  const s = tenant.settings

  const panelSettings: SupportPanelSettings = {
    requires_deposit: s.requires_deposit ?? false,
    deposit_percentage: s.deposit_percentage ?? 30,
    accepts_cash: s.accepts_cash ?? true,
    accepts_transfer: s.accepts_transfer ?? true,
    accepts_mercadopago: s.accepts_mercadopago ?? true,
    allow_online_booking: s.allow_online_booking ?? true,
    booking_advance_days: s.booking_advance_days ?? 6,
    auto_complete_minutes: s.auto_complete_minutes ?? 30,
  }

  return (
    <SupportActionsPanel
      tenantId={tenant.id}
      tenantName={tenant.name}
      status={tenant.status}
      forceableTargets={[...FORCEABLE_TRANSITIONS[tenant.status]]}
      destructiveTargets={[...DESTRUCTIVE_TARGET_STATUSES]}
      canReactivate={
        subscription !== null && REACTIVATABLE_STATUSES.includes(tenant.status)
      }
      isTrialing={tenant.status === 'trialing'}
      hasSubscription={subscription !== null}
      currentPlanId={subscription?.planId ?? null}
      plans={plans.map((p) => ({ id: p.id, name: p.name, priceMonthly: p.priceMonthly }))}
      settings={panelSettings}
    />
  )
}
