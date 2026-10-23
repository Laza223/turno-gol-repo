import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2 } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { ScrollTabs } from '@/components/ui/scroll-tabs'
import { requireSystemAdmin } from '@/modules/auth/system-admin.guards'
import { getPlusAdminState } from '@/modules/billing/plus.service'
import { PLUS_LIST_PER_COURT_CENTS, effectivePlusPerCourtCents } from '@/modules/billing/pricing'
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
  assignReferrerAction,
  cancelSubscriptionAction,
  changeBilledCourtsAction,
  extendTrialAction,
  forceTenantStatusAction,
  generateReferralLinkAction,
  reactivateTenantAction,
  resetStaffPasswordAction,
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

const PLUS_STATE_OFF = {
  kind: 'off',
  pricePerCourtCents: null,
  effectivePerCourtCents: PLUS_LIST_PER_COURT_CENTS,
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
  // Sin suscripción no hay Plus que mostrar (`getPlusAdminState` la exige).
  const plusAdmin =
    tab === 'resumen' && detail.subscription ? await getPlusAdminState(tenant.id) : null
  const plusState = plusAdmin
    ? {
        kind: plusAdmin.kind,
        pricePerCourtCents: plusAdmin.pricePerCourtCents,
        effectivePerCourtCents: plusAdmin.effectivePerCourtCents,
        accessUntil: plusAdmin.accessUntil?.toISOString() ?? null,
        quote: plusAdmin.quote,
      }
    : PLUS_STATE_OFF

  return (
    <div className="space-y-6">
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
  updateSettings: updateTenantSettingsAction,
  resetPassword: resetStaffPasswordAction,
  cancelSubscription: cancelSubscriptionAction,
}

function AccionesTab({ detail }: { detail: TenantDetail }) {
  const { tenant, subscription } = detail
  const s = tenant.settings

  // Piso de lo que se puede facturar: el server rechaza bajar de las canchas
  // prendidas (DOWNGRADE_BLOCKED), la UI directamente no deja intentarlo.
  const onlineCourts = detail.courts.filter((c) => c.status === 'online').length

  // Los tres parámetros del precio lineal vienen JOINeados con la suscripción.
  // Van juntos o no van: una banda legacy los tiene los tres en NULL.
  const pricing =
    subscription &&
    subscription.priceFirstCourtCents !== null &&
    subscription.priceExtraCourtCents !== null &&
    subscription.annualDiscountBps !== null
      ? {
          priceFirstCourtCents: subscription.priceFirstCourtCents,
          priceExtraCourtCents: subscription.priceExtraCourtCents,
          annualDiscountBps: subscription.annualDiscountBps,
        }
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
      plusPerCourtCents={
        subscription
          ? effectivePlusPerCourtCents(
              subscription.plusEnabled,
              subscription.plusPricePerCourtCents,
            )
          : 0
      }
      settings={panelSettings}
      actions={SUPPORT_ACTIONS}
    />
  )
}
