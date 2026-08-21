import { AlertTriangle, CreditCard, CheckCircle2, ExternalLink } from 'lucide-react'
import { requireAdminStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import {
  getBillingPayerEmail,
  getSubscriptionState,
  listActivePlans,
} from '@/modules/billing/billing.service'
import { listCourts } from '@/modules/courts/court.service'
import { SettingsTabs } from '../SettingsTabs'
import { ActivatePlanSection } from './ActivatePlanSection'
import { ChangePlanSection } from './ChangePlanSection'
import { CancelSubscriptionSection } from './CancelSubscriptionSection'
import { DisconnectMpSection } from './DisconnectMpSection'
import { MpPayerEmailSection } from './MpPayerEmailSection'
import { updateMpPayerEmailAction } from './actions'

// Nunca mostrar el código crudo del callback OAuth: siempre qué pasó + qué
// hacer (pages/onboarding.md §6.7). Vivía en StepPayments.tsx —se reubica acá
// tal cual (Fase 5 del refactor de onboarding, §D del plan: la seña se mudó
// del wizard a esta pantalla), no se reescribe.
const MP_UNAVAILABLE = new Set(['mp_not_configured', 'mp_config_missing'])

function mpErrorMessage(code: string, conflictTenant?: string | null): string {
  if (code === 'mp_already_connected') {
    const cual = conflictTenant ? `"${conflictTenant}"` : 'otro complejo'
    return `Esa cuenta de MercadoPago ya está cobrando para ${cual}. Cada complejo necesita su propia cuenta: entrá a MercadoPago con la cuenta de este complejo y volvé a intentar.`
  }
  if (MP_UNAVAILABLE.has(code)) {
    return 'La conexión con MercadoPago no está disponible en este momento. Probá de nuevo más tarde.'
  }
  return 'No pudimos conectar MercadoPago. Probá de nuevo en un momento.'
}

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Período de prueba',
  active: 'Activa',
  past_due: 'Pago pendiente',
  suspended: 'Suspendida',
  canceled: 'Cancelada',
  churned: 'Baja',
  blocked: 'Bloqueada',
}

function formatDate(d: string | Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function FacturacionPage(
  props: { searchParams?: Promise<{ error?: string; complejo?: string }> } = {},
) {
  const { tenant } = await requireAdminStaff()
  const searchParams = await props.searchParams

  let sub: Awaited<ReturnType<typeof getSubscriptionState>> | null = null
  const mpConnected = !!tenant.mpConnectedAt

  try {
    sub = await withTenantContext(tenant.id, (tx) => getSubscriptionState(tenant.id, tx))
  } catch {
    sub = null
  }

  const courts = await withTenantContext(tenant.id, (tx) => listCourts(tenant.id, tx))
  // Con qué cuenta de MercadoPago se paga la suscripción (migr. 078). Se lee
  // aunque no haya fila de suscripción: `getBillingPayerEmail` tolera el caso
  // y la sección igual muestra de dónde sale el default.
  const payer = await withTenantContext(tenant.id, (tx) => getBillingPayerEmail(tenant.id, tx))
  const defaultCourts = courts.length || 3

  // Bug raíz: createTenantWithTrial no insertaba tenant_subscriptions, así que
  // subscribe() siempre tiraba SubscriptionNotFoundError (fix 1a). Con la fila
  // ya sembrada en 'trialing', el admin necesita una forma de activar el plan.
  //
  // Ya suscripto (`active`) el catálogo se sigue necesitando, ahora para
  // CAMBIAR de plan: el complejo que sumó canchas se choca contra el techo del
  // suyo y hasta ahora no tenía salida in-app (el endpoint existía, ninguna UI
  // lo llamaba). Los demás estados no ofrecen catálogo a propósito: en
  // `past_due`/`suspended`/`blocked` lo que corresponde es regularizar el pago,
  // no cambiar de plan, y `upgrade()` los rechaza igual.
  const needsPlanCatalog = sub?.status === 'trialing' || sub?.status === 'active'
  const activePlans = needsPlanCatalog
    ? await withTenantContext(tenant.id, (tx) => listActivePlans(tx))
    : []

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>

      <SettingsTabs active="/settings/facturacion" />

      <section className="card-premium rounded-xl p-6">
        <h2 className="text-base font-semibold text-foreground">Suscripción</h2>
        {sub ? (
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="font-medium text-foreground">
                {sub.status === 'trialing' ? 'Sin plan elegido' : sub.planName}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Estado</dt>
              <dd className="font-medium text-foreground">
                {STATUS_LABELS[sub.status] ?? sub.status}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {sub.status === 'trialing' ? 'Fin de la prueba' : 'Próximo cobro'}
              </dt>
              <dd className="font-medium text-foreground tabular-nums">
                {formatDate(sub.currentPeriodEnd)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Todavía no tenés una suscripción activa. Conectá MercadoPago para empezar a cobrar señas
            y activar tu plan.
          </p>
        )}
      </section>

      {sub?.status === 'trialing' && activePlans.length > 0 && (
        <ActivatePlanSection plans={activePlans} defaultCourts={defaultCourts} />
      )}

      {sub?.status === 'active' && activePlans.length > 0 && (
        <ChangePlanSection
          plans={activePlans}
          currentPlanId={sub.planId}
          billingCycle={sub.billingCycle}
          pendingPlanId={sub.pendingPlanChange}
          periodEnd={new Date(sub.currentPeriodEnd).toISOString()}
        />
      )}

      <MpPayerEmailSection
        currentEmail={payer.override}
        ownerEmail={payer.ownerEmail}
        action={updateMpPayerEmailAction}
      />

      {sub && (
        <CancelSubscriptionSection
          status={sub.status}
          accessUntil={new Date(sub.currentPeriodEnd).toISOString()}
        />
      )}

      <section className="card-premium rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />{' '}
              MercadoPago
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Conectá tu cuenta para cobrar las señas de las reservas online directamente.
            </p>
            {/* Decir CUÁL cuenta está conectada, no solo que hay una: MercadoPago
                  no vuelve a pedir permiso si la app ya está autorizada, así que
                  conectar la cuenta personal en vez de la del complejo era un clic
                  sin ninguna pantalla de por medio — y las señas caían ahí sin que
                  nada lo dijera. */}
            {mpConnected && (
              <>
                <p className="mt-2 text-sm text-foreground">
                  Cobrando en la cuenta{' '}
                  <span className="font-semibold">{tenant.mpNickname ?? 'conectada'}</span>. Si no
                  es la del complejo, desconectala y conectá la correcta.
                </p>
                {/* Mercado Pago le pone 18 días de plazo a toda cuenta nueva por default
                      (verificado en producción, 2026-08-19: la cuenta configurada libera
                      antes, la default no). Es un ajuste DENTRO del panel de Mercado Pago,
                      no algo que TurnoGol pueda cambiar por el complejo — por eso el aviso
                      recién aparece acá, una vez conectado, y no en el botón de Conectar:
                      antes de eso el complejo no tiene panel de Costos y cuotas que tocar. */}
                <p className="mt-2 text-sm text-muted-foreground">
                  💡 Por defecto, Mercado Pago tarda 18 días en acreditarte la seña.{' '}
                  <a
                    href="https://youtu.be/pwUFOdZMxYs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline underline-offset-2 hover:text-emerald-700 dark:hover:text-emerald-300"
                  >
                    Mirá cómo cambiarlo a al instante (2 min)
                  </a>
                  .
                </p>
              </>
            )}
          </div>
          {mpConnected && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/20 dark:ring-emerald-500/30">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Conectado
            </span>
          )}
        </div>
        {searchParams?.error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{mpErrorMessage(searchParams.error, searchParams.complejo)}</p>
          </div>
        )}

        {mpConnected ? (
          <DisconnectMpSection
            nickname={tenant.mpNickname}
            requiresDeposit={!!tenant.settings?.requires_deposit}
          />
        ) : (
          <a
            href="/api/mp/oauth-start"
            className="mt-4 inline-flex h-11 md:h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-emerald-700 transition-colors"
          >
            Conectar MercadoPago <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        )}
      </section>
    </div>
  )
}
