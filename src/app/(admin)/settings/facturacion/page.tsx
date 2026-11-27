import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import {
  CalendarDays,
  ChevronDown,
  CircleOff,
  CreditCard,
  MessageCircle,
  ReceiptText,
  type LucideIcon,
} from 'lucide-react'
import { requireAdminStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import {
  getBillingPayerEmail,
  getSubscriptionState,
  isTrialCheckoutUnpaid,
  listActivePlans,
  listInvoices,
} from '@/modules/billing/billing.service'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { listCourts } from '@/modules/courts/court.service'
import {
  buildPriceBreakdown,
  canQuoteCourtCount,
  COURT_COUNT_QUOTE_PREFIX,
  monthlyPlusAmount,
  subscriptionPlusPrice,
} from '@/modules/billing/pricing'
import { CANCELABLE } from '@/modules/billing/cancelable-statuses'
import { isExpiredStatus, READ_ONLY_TENANT_STATUSES } from '@/modules/tenants/tenant.lifecycle'
import { formatArs } from '@/lib/format'
import { SUPPORT_EMAIL } from '@/shared/constants'
import { CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { LogoMark } from '@/components/ui/logo-mark'
import { HashOpenCollapsible } from './HashOpenCollapsible'
import { SettingsHeader } from '../SettingsHeader'
import {
  changeUnverifiedEmailAction,
  resendVerificationEmailAction,
} from '@/app/(admin)/actions/email-verification'
import { getEmailVerificationState } from '@/modules/auth/email-verification.service'
import { CuotaSection } from './CuotaSection'
import { CycleTotal, PriceBreakdown } from './PriceBreakdown'
import { firstCuotaPricing } from './cuota-pricing'
import { CancelSubscriptionSection } from './CancelSubscriptionSection'
import { InvoiceHistorySection, STATUS_LABELS } from './InvoiceHistorySection'
import { MpPayerEmailSection } from './MpPayerEmailSection'
import { SUBSCRIPTION_STATUS_LABEL } from './subscription-status-label'
import { PlusSection } from './PlusSection'
import {
  disablePlusAction,
  startPlusProratePaymentAction,
  updateMpPayerEmailAction,
} from './actions'
import styles from './subscription.module.css'

function formatDate(d: string | Date | null): string {
  if (!d) return 'Sin fecha confirmada'
  return new Date(d).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function BillingDisclosure({
  id,
  icon: Icon,
  title,
  summary,
  children,
}: {
  id?: string
  icon: LucideIcon
  title: string
  summary?: ReactNode
  children: ReactNode
}) {
  return (
    <HashOpenCollapsible hash={id ? `#${id}` : undefined} id={id} className="scroll-mt-24">
      <CollapsibleTrigger className={styles.setting}>
        <Icon aria-hidden className={styles.settingIcon} />
        <span className={styles.settingTitle}>{title}</span>
        {summary && <span className={styles.settingSummary}>{summary}</span>}
        <ChevronDown aria-hidden className={styles.settingChevron} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-1 pb-4">{children}</CollapsibleContent>
    </HashOpenCollapsible>
  )
}

/**
 * Ajustes → Suscripción: solo lo que el complejo le paga a TurnoGol. La cuenta
 * de MercadoPago para cobrar señas (otra app de MercadoPago, otro circuito de
 * plata) se mudó a Reservas y seña el 2026-09-25; la URL sigue siendo
 * `/settings/facturacion` porque la usan los mails de cobro ya mandados.
 */
export default async function FacturacionPage() {
  const { tenant, user } = await requireAdminStaff({ allowReadOnly: true })
  // En solo lectura esta pantalla no tiene nada que ofrecer (la cuota no se
  // activa ni se cambia desde acá en `suspended`): la salida es /reactivar. Es
  // también a donde llega el botón del mail "Terminó tu prueba",
  // que apunta a esta URL.
  if (READ_ONLY_TENANT_STATUSES.has(tenant.status)) redirect('/reactivar')
  // Plan no activo: no hay cuota que mostrar ni cambiar; activar el plan es /reactivar.
  if (isExpiredStatus(tenant.status)) redirect('/reactivar')

  let sub: Awaited<ReturnType<typeof getSubscriptionState>> | null = null

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

  const emailState = await getEmailVerificationState(user.staffUserId)
  const verifyEmail =
    emailState && !emailState.verified
      ? {
          email: emailState.email,
          resendAction: resendVerificationEmailAction,
          changeEmailAction: changeUnverifiedEmailAction,
        }
      : undefined

  // Las canchas PRENDIDAS son el piso de la cuota: facturar por menos sería
  // operar de más pagando de menos (el server lo rechaza con DOWNGRADE_BLOCKED).
  const onlineCourts = courts.filter((c) => c.status === 'online').length

  // En prueba, un preapproval guardado puede ser un checkout que nunca se
  // pagó: eso no es un débito, y el dueño tiene que poder activar el plan como
  // cualquier otro (`isTrialCheckoutUnpaid`). `subscribe()` ya sabe qué hacer
  // con ese checkout viejo: lo reusa si sirve tal cual o arma uno nuevo.
  const trialCheckoutUnpaid =
    sub?.status === 'trialing' && sub.mpSubscriptionId
      ? await isTrialCheckoutUnpaid(tenant.id, sub.mpSubscriptionId, getBillingGateway())
      : false
  const liveMpSubscriptionId = trialCheckoutUnpaid ? null : (sub?.mpSubscriptionId ?? null)
  const assignedPlanId =
    sub?.status === 'trialing' &&
    !liveMpSubscriptionId &&
    !sub.planSlug.startsWith(COURT_COUNT_QUOTE_PREFIX)
      ? undefined
      : sub?.planId
  const pricing = sub
    ? firstCuotaPricing(
        await withTenantContext(tenant.id, (tx) => listActivePlans(tx, assignedPlanId)),
      )
    : null

  // `trialing` SIN débito todavía es la primera activación (checkout de
  // MP). Con débito ya cargado —o con la suscripción activa— cambiar la
  // cantidad es mover el monto de uno que ya existe, y eso nunca cobra en el
  // momento (decisión P4). En `past_due` no se ofrece tocar nada: lo que
  // corresponde es regularizar el pago, y el service lo rechaza igual.
  const cuotaMode: 'activate' | 'manage' | null =
    !sub || !pricing
      ? null
      : sub.status === 'trialing'
        ? liveMpSubscriptionId
          ? 'manage'
          : 'activate'
        : sub.status === 'active'
          ? 'manage'
          : null

  // Plus EFECTIVO que se factura (no el flag): el mismo número que va al débito.
  const plusBilledPerCourt =
    sub && pricing
      ? subscriptionPlusPrice(
          sub.plus.enabled,
          sub.plus.usesListPrice ? null : sub.plus.perCourtCents,
          pricing,
        )
      : 0

  const readOnlyBreakdown =
    sub && pricing && !cuotaMode && canQuoteCourtCount(sub.billedCourts, pricing)
      ? buildPriceBreakdown({
          billedCourts: sub.billedCourts,
          cycle: sub.billingCycle,
          plusPerCourtCents: plusBilledPerCourt,
          ...pricing,
        })
      : null

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
  const trialing = sub?.status === 'trialing'
  const showBaja =
    sub &&
    (CANCELABLE.has(sub.status) || sub.status === 'canceled' || (trialing && liveMpSubscriptionId))
  const showPlus = sub && (sub.plus.enabled || sub.plus.accessUntil || sub.plus.quote)

  return (
    <div className={styles.page}>
      <SettingsHeader title="Suscripción" />
      <div className={styles.spread}>
        {sub && (
          <section aria-labelledby="subscription-plan" className={styles.pass}>
            <Image
              src="/suscripcion-cancha.webp"
              alt=""
              fill
              sizes="(min-width: 1200px) 600px, (min-width: 900px) 48vw, 100vw"
              loading="eager"
              className={styles.photo}
            />
            <div className={styles.passTop}>
              <span className={styles.club}>
                <LogoMark className="w-8 shrink-0" markClassName="text-white" />
                {tenant.name}
              </span>
              <span className={styles.status} data-status={sub.status}>
                {trialing ? 'En prueba' : SUBSCRIPTION_STATUS_LABEL[sub.status]}
              </span>
            </div>
            <div className={styles.passInfo}>
              <h2 id="subscription-plan" className={styles.planTitle}>
                <span>Plan</span> Completo
              </h2>
              <dl className={styles.planFacts}>
                <div>
                  <dt>
                    <CalendarDays aria-hidden className="size-4" />
                    {trialing
                      ? 'Fin de la prueba'
                      : sub.status === 'canceled'
                        ? 'Acceso hasta'
                        : 'Próximo cobro'}
                  </dt>
                  <dd>{formatDate(trialing ? tenant.trialEndsAt : sub.currentPeriodEnd)}</dd>
                </div>
                {sub.billedCourts !== onlineCourts && (
                  <div>
                    <dt>Canchas facturadas</dt>
                    <dd>
                      {sub.billedCourts} · {onlineCourts}{' '}
                      {onlineCourts === 1 ? 'activa' : 'activas'}
                    </dd>
                  </div>
                )}
              </dl>
              {trialing && (
                <p id={liveMpSubscriptionId ? undefined : 'baja'} className={styles.passNote}>
                  {liveMpSubscriptionId
                    ? 'Todavía no se cobra.'
                    : 'Si no activás Completo, el plan queda no activo y conservás tus datos.'}
                </p>
              )}
            </div>
          </section>
        )}
        {sub && pricing && cuotaMode ? (
          <CuotaSection
            pricing={pricing}
            mode={cuotaMode}
            onlineCourts={onlineCourts}
            billedCourts={sub.billedCourts}
            pendingBilledCourts={sub.pendingBilledCourts}
            periodEnd={new Date(sub.currentPeriodEnd).toISOString()}
            billingCycle={sub.billingCycle}
            plusPerCourtCents={plusBilledPerCourt}
            verifyEmail={verifyEmail}
            subscriptionLayout
          />
        ) : (
          <section className={styles.receipt}>
            <h2 className="text-base font-semibold text-foreground">Tu cuota</h2>
            {readOnlyBreakdown && sub ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Esta cuota cubre {sub.billedCourts}{' '}
                  {sub.billedCourts === 1 ? 'cancha' : 'canchas'}.
                  {sub.status === 'past_due' && ' Para cambiarla, primero regularizá el pago.'}
                </p>
                <CycleTotal breakdown={readOnlyBreakdown} />
                <PriceBreakdown breakdown={readOnlyBreakdown} receipt />
              </>
            ) : (
              // `sub` solo es null si la lectura falló: todo complejo nace con su
              // fila de suscripción (en prueba). Activar la cuota NO pide conectar
              // el MercadoPago del complejo — son dos apps distintas.
              <p className="mt-4 text-sm text-muted-foreground">
                No pudimos leer tu suscripción. Probá de nuevo en un rato o escribinos a{' '}
                {SUPPORT_EMAIL}.
              </p>
            )}
          </section>
        )}
      </div>

      <section className={styles.settings} aria-labelledby="billing-settings">
        <h2 id="billing-settings">Pagos y servicios</h2>
        <div className={styles.settingList}>
          {showPlus && sub && (
            <BillingDisclosure
              icon={MessageCircle}
              title="Asistente de WhatsApp"
              summary={
                sub.plus.quote
                  ? 'Pago pendiente'
                  : sub.plus.enabled
                    ? 'Incluido en la cuota'
                    : 'Baja agendada'
              }
            >
              <PlusSection
                plus={{
                  enabled: sub.plus.enabled,
                  perCourtCents: sub.plus.perCourtCents,
                  monthlyCents:
                    pricing?.byCourtCount && canQuoteCourtCount(sub.billedCourts, pricing)
                      ? monthlyPlusAmount(sub.billedCourts, plusBilledPerCourt)
                      : undefined,
                  accessUntil: sub.plus.accessUntil
                    ? new Date(sub.plus.accessUntil).toISOString()
                    : null,
                  quote: sub.plus.quote,
                }}
                periodEnd={new Date(sub.currentPeriodEnd).toISOString()}
                disableAction={disablePlusAction}
                payAction={startPlusProratePaymentAction}
              />
            </BillingDisclosure>
          )}
          <BillingDisclosure
            icon={ReceiptText}
            title="Historial de cobros"
            summary={
              lastInvoice
                ? `Último cobro · ${formatDate(lastInvoice.date)} · ${formatArs(lastInvoice.amount)} · ${STATUS_LABELS[lastInvoice.status].toLowerCase()}`
                : undefined
            }
          >
            {liveMpSubscriptionId && (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <CreditCard className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Ya hay una suscripción de Mercado Pago creada para tu cuota. Revisá el medio de
                  pago conectado en tu cuenta de Mercado Pago.
                </span>
              </p>
            )}
            <InvoiceHistorySection invoices={invoices} />
          </BillingDisclosure>

          <BillingDisclosure
            id="cuenta-mp"
            icon={CreditCard}
            title="Cuenta de Mercado Pago"
            summary={payer.override ?? payer.ownerEmail ?? undefined}
          >
            <MpPayerEmailSection
              currentEmail={payer.override}
              ownerEmail={payer.ownerEmail}
              action={updateMpPayerEmailAction}
              anchorId={undefined}
            />
          </BillingDisclosure>

          {showBaja && sub && (
            <BillingDisclosure id="baja" icon={CircleOff} title="Dar de baja TurnoGol">
              {sub.status === 'trialing' ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Para darte de baja antes del primer cobro, escribinos a {SUPPORT_EMAIL}.
                </p>
              ) : (
                <CancelSubscriptionSection
                  status={sub.status}
                  accessUntil={new Date(sub.currentPeriodEnd).toISOString()}
                />
              )}
            </BillingDisclosure>
          )}
        </div>
      </section>
    </div>
  )
}
