import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2 } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { ScrollTabs } from '@/components/ui/scroll-tabs'
import { requireSystemAdmin } from '@/modules/auth/system-admin.guards'
import { listActivePlans } from '@/modules/billing/billing.service'
import { withTenantContext } from '@/shared/db/client'
import { getBotFlagOn, getPlusAdminState } from '@/modules/billing/plus.service'
import {
  buildPriceBreakdown,
  canQuoteCourtCount,
  PLUS_LIST_MONTHLY_CENTS,
  catalogPricing,
  effectivePlusCents,
} from '@/modules/billing/pricing'
import {
  getTenantActivity,
  getTenantDetail,
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
  applyCurrentCatalogPriceAction,
  assignReferrerAction,
  cancelSubscriptionAction,
  changeBilledCourtsAction,
  extendTrialAction,
  forceTenantStatusAction,
  generateReferralLinkAction,
  reactivateTenantAction,
  resetStaffPasswordAction,
  saveLargeComplexQuoteAction,
  setTenantPlusAction,
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
  actividad: 'Historial',
  acciones: 'Acciones',
}

const ACTIVITY_PAGE_SIZE = 25

const PLUS_STATE_NO_SUBSCRIPTION = {
  kind: 'no_subscription',
  specialPriceCents: null,
  effectiveCents: PLUS_LIST_MONTHLY_CENTS,
  accessUntil: null,
  quote: null,
} as const

// Fuera del componente: el lint de pureza no deja llamar a Date.now() en el render.
function currentMs(): number {
  return Date.now()
}

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

  const activity =
    tab === 'actividad'
      ? await getTenantActivity(params.id, {
          page: parsePage(searchParams.actPage),
          pageSize: ACTIVITY_PAGE_SIZE,
        })
      : null

  const { tenant } = detail
  // Sin suscripción no hay Plus que cobrar (`getPlusAdminState` la exige), pero
  // el bot puede estar prendido por un override: se muestra el flag real.
  const plusAdmin =
    tab === 'resumen' && detail.subscription ? await getPlusAdminState(tenant.id) : null
  const plusState = plusAdmin
    ? {
        kind: plusAdmin.kind,
        specialPriceCents: plusAdmin.specialPriceCents,
        effectiveCents: plusAdmin.effectiveCents,
        accessUntil: plusAdmin.accessUntil?.toISOString() ?? null,
        quote: plusAdmin.quote,
      }
    : {
        ...PLUS_STATE_NO_SUBSCRIPTION,
        botOn: tab === 'resumen' ? await getBotFlagOn(tenant.id) : false,
      }

  return (
    <div className="space-y-3 lg:space-y-6">
      <PageHeader
        variant="plain"
        back={
          <Link
            href="/super-admin/tenants"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Complejos
          </Link>
        }
        icon={
          <Building2
            className="h-6 w-6 text-emerald-700 dark:text-emerald-400"
            aria-hidden="true"
          />
        }
        title={tenant.name}
        subtitle={tenant.email}
        actions={<TenantStatusBadge status={tenant.status} />}
      />

      <ScrollTabs
        ariaLabel="Secciones del complejo"
        activeHref={`/super-admin/tenants/${tenant.id}?tab=${tab}`}
        tabs={TABS.map((t) => ({
          href: `/super-admin/tenants/${tenant.id}?tab=${t}`,
          label: TAB_LABELS[t],
        }))}
      />

      {tab === 'resumen' && (
        <ResumenTab
          detail={detail}
          impersonateAction={startImpersonationAction}
          updateMarketplaceVisibilityAction={updateTenantMarketplaceVisibilityAction}
          plusState={plusState}
          setTenantPlusAction={setTenantPlusAction}
          generateReferralLinkAction={generateReferralLinkAction}
          assignReferrerAction={assignReferrerAction}
          nowMs={currentMs()}
        />
      )}
      {tab === 'suscripcion' && <SuscripcionTab detail={detail} />}
      {tab === 'actividad' && activity && <ActividadTab tenantId={tenant.id} activity={activity} />}
      {tab === 'acciones' && <AccionesTab detail={detail} />}
    </div>
  )
}

// ─── Acciones ────────────────────────────────────────────────────────────────

const SUPPORT_ACTIONS: SupportActionsBag = {
  forceStatus: forceTenantStatusAction,
  reactivate: reactivateTenantAction,
  extendTrial: extendTrialAction,
  changeBilledCourts: changeBilledCourtsAction,
  applyCurrentCatalogPrice: applyCurrentCatalogPriceAction,
  saveLargeComplexQuote: saveLargeComplexQuoteAction,
  updateSettings: updateTenantSettingsAction,
  resetPassword: resetStaffPasswordAction,
  cancelSubscription: cancelSubscriptionAction,
}

async function AccionesTab({ detail }: { detail: TenantDetail }) {
  const { tenant, subscription } = detail
  const s = tenant.settings

  // Piso de lo que se puede facturar: el server rechaza bajar de las canchas
  // prendidas (DOWNGRADE_BLOCKED), la UI directamente no deja intentarlo.
  const onlineCourts = detail.courts.filter((c) => c.status === 'online').length

  const pricing = subscription
    ? catalogPricing({ ...subscription, slug: subscription.planSlug ?? undefined })
    : null

  const [activePlan] = subscription
    ? await withTenantContext(tenant.id, (tx) => listActivePlans(tx))
    : []
  const newPricing = activePlan ? catalogPricing(activePlan) : null
  const canSwitch =
    subscription &&
    newPricing?.byCourtCount &&
    (subscription.status === 'trialing' ||
      (subscription.status === 'active' && subscription.mpSubscriptionId)) &&
    subscription.pendingBilledCourts === null &&
    onlineCourts <= subscription.billedCourts &&
    canQuoteCourtCount(subscription.billedCourts, newPricing)
  const nextCatalogPrice =
    canSwitch && subscription && newPricing
      ? buildPriceBreakdown({
          ...newPricing,
          billedCourts: subscription.billedCourts,
          cycle: subscription.billingCycle,
          plusMonthlyCents: effectivePlusCents(
            subscription.plusEnabled || (await getBotFlagOn(tenant.id)),
            null,
          ),
        })
      : null

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
      billedCourts={subscription?.billedCourts ?? null}
      billingCycle={subscription?.billingCycle ?? null}
      onlineCourts={onlineCourts}
      pricing={pricing}
      nextCatalogPrice={nextCatalogPrice}
      canRecordLargeQuote={Boolean(
        newPricing?.byCourtCount &&
        onlineCourts >= 8 &&
        (subscription?.status === 'trialing' ||
          subscription?.status === 'free' ||
          subscription?.status === 'trial_expired') &&
        !subscription.mpSubscriptionId,
      )}
      plusMonthlyCents={
        subscription && pricing
          ? effectivePlusCents(subscription.plusEnabled, subscription.plusPricePerCourtCents)
          : 0
      }
      settings={panelSettings}
      actions={SUPPORT_ACTIONS}
    />
  )
}
