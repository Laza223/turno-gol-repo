import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSystemAdmin } from '@/modules/auth/system-admin.guards'
import {
  getTenantActivity,
  getTenantDetail,
  listActivePlans,
  type PlanSummary,
  type TenantDetail,
} from '@/modules/super-admin/tenants.service'
import { DESTRUCTIVE_TARGET_STATUSES } from '@/modules/super-admin/support.schema'
import {
  FORCEABLE_TRANSITIONS,
  REACTIVATABLE_STATUSES,
} from '@/modules/super-admin/support.service'
import { TenantStatusBadge } from '../../_components/tenant-status-visual'
import {
  SupportActionsPanel,
  type SupportActionsBag,
  type SupportPanelSettings,
} from './_components/support-actions-panel'
import { ResumenTab } from './_components/resumen-tab'
import { SuscripcionTab } from './_components/suscripcion-tab'
import { ActividadTab } from './_components/actividad-tab'
import {
  cancelSubscriptionAction,
  changePlanAction,
  extendTrialAction,
  forceTenantStatusAction,
  reactivateTenantAction,
  resetStaffPasswordAction,
  startImpersonationAction,
  updateTenantMarketplaceVisibilityAction,
  updateTenantSettingsAction,
} from './actions'

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

export default async function SuperAdminTenantDetailPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; actPage?: string }>
}) {
  const searchParams = await props.searchParams
  const params = await props.params
  await requireSystemAdmin()

  if (!UUID_RE.test(params.id)) notFound()
  const detail = await getTenantDetail(params.id)
  if (!detail) notFound()

  const tab = parseTab(searchParams.tab)
  const plansList = await listActivePlans(params.id)

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

      {tab === 'resumen' && (
        <ResumenTab
          detail={detail}
          impersonateAction={startImpersonationAction}
          updateMarketplaceVisibilityAction={updateTenantMarketplaceVisibilityAction}
        />
      )}
      {tab === 'suscripcion' && <SuscripcionTab detail={detail} plans={plansList} />}
      {tab === 'actividad' && activity && <ActividadTab tenantId={tenant.id} activity={activity} />}
      {tab === 'acciones' && <AccionesTab detail={detail} plans={plansList} />}
    </div>
  )
}

// ─── Acciones ────────────────────────────────────────────────────────────────

const SUPPORT_ACTIONS: SupportActionsBag = {
  forceStatus: forceTenantStatusAction,
  reactivate: reactivateTenantAction,
  extendTrial: extendTrialAction,
  changePlan: changePlanAction,
  updateSettings: updateTenantSettingsAction,
  resetPassword: resetStaffPasswordAction,
  cancelSubscription: cancelSubscriptionAction,
}

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
      canReactivate={subscription !== null && REACTIVATABLE_STATUSES.includes(tenant.status)}
      isTrialing={tenant.status === 'trialing'}
      hasSubscription={subscription !== null}
      currentPlanId={subscription?.planId ?? null}
      plans={plans.map((p) => ({ id: p.id, name: p.name, priceMonthly: p.priceMonthly }))}
      settings={panelSettings}
      actions={SUPPORT_ACTIONS}
    />
  )
}
