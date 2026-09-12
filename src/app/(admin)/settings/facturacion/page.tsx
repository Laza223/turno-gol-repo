import type { ReactNode } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  CreditCard,
  CheckCircle2,
  ExternalLink,
  Info,
} from 'lucide-react'
import { requireAdminStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import {
  getBillingPayerEmail,
  getSubscriptionState,
  listActivePlans,
  listInvoices,
} from '@/modules/billing/billing.service'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { listCourts } from '@/modules/courts/court.service'
import { formatArs } from '@/lib/format'
import { PLANS } from '@/app/(business)/precios/plans-data'
import { CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { HashOpenCollapsible } from './HashOpenCollapsible'
import { SettingsTabs } from '../SettingsTabs'
import { ActivatePlanSection } from './ActivatePlanSection'
import { ChangePlanSection } from './ChangePlanSection'
import { CancelSubscriptionSection } from './CancelSubscriptionSection'
import { DisconnectMpSection } from './DisconnectMpSection'
import { InvoiceHistorySection, STATUS_LABELS } from './InvoiceHistorySection'
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

function formatDate(d: string | Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** "Hasta N canchas" / "Canchas ilimitadas", según el techo del plan (`PLANS`). */
function courtsRangeLabel(maxCourts: number | null): string {
  if (maxCourts === null) return 'Canchas ilimitadas'
  return `Hasta ${maxCourts} ${maxCourts === 1 ? 'cancha' : 'canchas'}`
}

/**
 * Progressive disclosure de una sección de Facturación (rediseño "en 3
 * segundos + todo lo demás plegado"). Envuelve `children` — que siguen
 * siendo las secciones reales, con su propio `card-premium` — bajo un
 * trigger compacto con resumen, mismo patrón que "Excepciones y detalles
 * avanzados" de `ScheduleFields.tsx`. Plegado por default: nada acá es
 * el "en 3 segundos" de las dos cards de arriba.
 */
function BillingDisclosure({
  id,
  className,
  title,
  summary,
  children,
}: {
  /**
   * En el elemento RAÍZ (siempre visible, contiene el trigger), no en el
   * contenido plegable — `#cuenta-mp` (link de recuperación de
   * `ActivatePlanSection` cuando el email de MP está tomado) tiene que poder
   * llevar a un elemento visible aunque el disclosure esté cerrado. `id` se
   * dobla como el hash que `HashOpenCollapsible` escucha: sin esto, un click
   * en "Cargar mi cuenta de MercadoPago" aterrizaba en un acordeón CERRADO.
   */
  id?: string
  className?: string
  title: string
  summary?: ReactNode
  children: ReactNode
}) {
  return (
    <HashOpenCollapsible hash={id ? `#${id}` : undefined} id={id} className={className}>
      <CollapsibleTrigger className="group flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          {summary && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summary}</span>
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-4">{children}</CollapsibleContent>
    </HashOpenCollapsible>
  )
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
  const showPlanChange = needsPlanCatalog && activePlans.length > 0

  // doc15 §5.8: historial de cobros, leído en vivo de MercadoPago (sin tabla
  // local, ver InvoiceEntry). Igual que `sub` arriba: si MP no responde, la
  // página se sigue mostrando en vez de romper por un dato que no es crítico.
  let invoices: Awaited<ReturnType<typeof listInvoices>> = []
  try {
    invoices = await listInvoices(tenant.id, getBillingGateway())
  } catch {
    invoices = []
  }
  const lastInvoice = invoices[0] ?? null
  const showCancelOrDisconnect = !!sub || mpConnected

  const currentPlanMaxCourts = sub
    ? (PLANS.find((p) => p.slug === sub.planSlug)?.maxCourts ?? null)
    : null

  return (
    <div className="space-y-6">
      {/* MASTER §6.8: la vista no abre encabezado propio — ver reservas/page.tsx. */}
      <SettingsTabs active="/settings/facturacion" />

      {/* "En 3 segundos": lo único que se ve sin plegar nada. */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="card-premium rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground">Tu plan</h2>
          {sub ? (
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="font-medium text-foreground">
                  {/* Todo tenant en trial ya tiene un plan_id real desde el alta (el
                      super admin lo asigna) — "Sin plan elegido" era un ternario
                      hardcodeado que ignoraba sub.planName y le hacía creer al
                      dueño que todavía no había plan, cuando en realidad lo que
                      falta es el primer cobro. Calificamos en vez de esconder. */}
                  {sub.status === 'trialing'
                    ? `${sub.planName} · todavía no se cobra`
                    : sub.planName}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Canchas</dt>
                <dd className="font-medium text-foreground">
                  {courtsRangeLabel(currentPlanMaxCourts)} · usás {courts.length}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {sub.status === 'trialing' ? 'Fin de la prueba' : 'Próximo cobro'}
                </dt>
                <dd className="font-medium text-foreground tabular-nums">
                  {/* En trial la fecha real vive en tenants.trial_ends_at: es la que
                      mueve extendTrial, la que lee el worker que expira trials y la
                      que ve super admin. tenant_subscriptions.current_period_end
                      quedó clavado en el valor sembrado al crear el tenant y
                      extendTrial no lo toca (a propósito: tocarlo perpetuaría dos
                      copias de la misma fecha) — por eso esta pantalla tiene que
                      leer la misma columna que todos los demás lectores en vez de
                      mostrar una segunda fecha que se desincroniza sola. */}
                  {formatDate(
                    sub.status === 'trialing' ? tenant.trialEndsAt : sub.currentPeriodEnd,
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Todavía no tenés una suscripción activa. Conectá MercadoPago para empezar a cobrar
              señas y activar tu plan.
            </p>
          )}
        </section>

        <section className="card-premium rounded-xl p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />{' '}
              MercadoPago para cobrar señas
            </h2>
            {mpConnected && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/20 dark:ring-emerald-500/30">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Conectado
              </span>
            )}
          </div>

          {mpConnected ? (
            <>
              {/* Decir CUÁL cuenta está conectada, no solo que hay una: MercadoPago
                    no vuelve a pedir permiso si la app ya está autorizada, así que
                    conectar la cuenta personal en vez de la del complejo era un clic
                    sin ninguna pantalla de por medio — y las señas caían ahí sin que
                    nada lo dijera. */}
              <p className="mt-2 text-sm text-foreground">
                Cobrando en la cuenta{' '}
                <span className="font-semibold">{tenant.mpNickname ?? 'conectada'}</span>. Si no es
                la del complejo, desconectala y conectá la correcta.
              </p>
              {/* Mercado Pago le pone 18 días de plazo a toda cuenta nueva por default
                    (verificado en producción, 2026-08-19: la cuenta configurada libera
                    antes, la default no). Es un ajuste DENTRO del panel de Mercado Pago,
                    no algo que TurnoGol pueda cambiar por el complejo — por eso el aviso
                    recién aparece acá, una vez conectado, y no en el botón de Conectar:
                    antes de eso el complejo no tiene panel de Costos y cuotas que tocar. */}
              <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Por defecto, Mercado Pago tarda 18 días en acreditarte la seña.{' '}
                  <a
                    href="https://youtu.be/pwUFOdZMxYs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline underline-offset-2 hover:text-emerald-700 dark:hover:text-emerald-300"
                  >
                    Mirá cómo cambiarlo a al instante (2 min)
                  </a>
                  .
                </span>
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Conectá tu cuenta de MercadoPago para cobrar las señas de las reservas online
              directamente.
            </p>
          )}

          {searchParams?.error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{mpErrorMessage(searchParams.error, searchParams.complejo)}</p>
            </div>
          )}

          {!mpConnected && (
            <a
              href="/api/mp/oauth-start"
              className="mt-4 inline-flex h-11 md:h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Conectar MercadoPago <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          )}
        </section>
      </div>

      {/* Todo lo demás, plegado. */}
      <div className="space-y-3">
        <BillingDisclosure
          title="Pagos del plan"
          summary={
            lastInvoice
              ? `Último: ${formatDate(lastInvoice.date)} · ${formatArs(lastInvoice.amount)} · ${STATUS_LABELS[lastInvoice.status].toLowerCase()}`
              : undefined
          }
        >
          {sub?.mpSubscriptionId && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Ya hay una suscripción de MercadoPago creada para este plan. Revisá el método de
                pago conectado en tu cuenta de MercadoPago.
              </span>
            </p>
          )}
          <InvoiceHistorySection invoices={invoices} />
        </BillingDisclosure>

        {showPlanChange && (
          <BillingDisclosure
            title="Cambiar de plan"
            summary="Solo si sumás canchas y no te entran."
          >
            {sub?.status === 'trialing' && (
              <ActivatePlanSection plans={activePlans} defaultCourts={defaultCourts} />
            )}
            {sub?.status === 'active' && (
              <ChangePlanSection
                plans={activePlans}
                currentPlanId={sub.planId}
                billingCycle={sub.billingCycle}
                pendingPlanId={sub.pendingPlanChange}
                periodEnd={new Date(sub.currentPeriodEnd).toISOString()}
              />
            )}
          </BillingDisclosure>
        )}

        <BillingDisclosure
          id="cuenta-mp"
          className="scroll-mt-24"
          title="Cuenta con la que pagás TurnoGol"
          summary={payer.override ?? payer.ownerEmail ?? undefined}
        >
          <MpPayerEmailSection
            currentEmail={payer.override}
            ownerEmail={payer.ownerEmail}
            action={updateMpPayerEmailAction}
            anchorId={undefined}
          />
        </BillingDisclosure>

        {showCancelOrDisconnect && (
          <BillingDisclosure
            title="Dar de baja"
            summary="Cancelar tu suscripción o desconectar MercadoPago."
          >
            {sub && (
              <CancelSubscriptionSection
                status={sub.status}
                accessUntil={new Date(sub.currentPeriodEnd).toISOString()}
              />
            )}
            {mpConnected && (
              <DisconnectMpSection
                nickname={tenant.mpNickname}
                requiresDeposit={!!tenant.settings?.requires_deposit}
              />
            )}
          </BillingDisclosure>
        )}
      </div>
    </div>
  )
}
