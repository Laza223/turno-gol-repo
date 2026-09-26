import type { ReactNode } from 'react'
import { ChevronDown, CreditCard } from 'lucide-react'
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
import { buildPriceBreakdown } from '@/modules/billing/pricing'
import { CANCELABLE } from '@/modules/billing/cancelable-statuses'
import { formatArs } from '@/lib/format'
import { SUPPORT_EMAIL } from '@/shared/constants'
import { CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { HashOpenCollapsible } from './HashOpenCollapsible'
import { SettingsHeader } from '../SettingsHeader'
import { CuotaSection } from './CuotaSection'
import { PriceBreakdown } from './PriceBreakdown'
import { firstCuotaPricing } from './cuota-pricing'
import { CancelSubscriptionSection } from './CancelSubscriptionSection'
import { InvoiceHistorySection, STATUS_LABELS } from './InvoiceHistorySection'
import { MpPayerEmailSection } from './MpPayerEmailSection'
import { SUBSCRIPTION_STATUS_LABEL } from './subscription-status-label'
import { updateMpPayerEmailAction } from './actions'

function formatDate(d: string | Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Progressive disclosure de una sección de Suscripción (rediseño "en 3
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

/**
 * Ajustes → Suscripción: solo lo que el complejo le paga a TurnoGol. La cuenta
 * de MercadoPago para cobrar señas (otra app de MercadoPago, otro circuito de
 * plata) se mudó a Reservas y seña el 2026-09-25; la URL sigue siendo
 * `/settings/facturacion` porque la usan los mails de cobro ya mandados.
 */
export default async function FacturacionPage() {
  const { tenant } = await requireAdminStaff()

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

  // Las canchas PRENDIDAS son el piso de la cuota: facturar por menos sería
  // operar de más pagando de menos (el server lo rechaza con DOWNGRADE_BLOCKED).
  const onlineCourts = courts.filter((c) => c.status === 'online').length

  // El catálogo ya no es un menú de planes: es la fila única con los tres
  // parámetros de la cuenta (migr. 091). Se lee siempre que haya suscripción,
  // porque hasta la vista de solo lectura necesita mostrar el desglose.
  const activePlans = sub ? await withTenantContext(tenant.id, (tx) => listActivePlans(tx)) : []
  const pricing = firstCuotaPricing(activePlans)

  // `trialing` SIN preapproval todavía es la primera activación (checkout de
  // MP). Con preapproval ya creado —o con la suscripción activa— cambiar la
  // cantidad es mover el monto de uno que ya existe, y eso nunca cobra en el
  // momento (decisión P4). En `past_due` no se ofrece tocar nada: lo que
  // corresponde es regularizar el pago, y el service lo rechaza igual.
  const cuotaMode: 'activate' | 'manage' | null =
    !sub || !pricing
      ? null
      : sub.status === 'trialing'
        ? sub.mpSubscriptionId
          ? 'manage'
          : 'activate'
        : sub.status === 'active'
          ? 'manage'
          : null

  const readOnlyBreakdown =
    sub && pricing && !cuotaMode
      ? buildPriceBreakdown({
          billedCourts: sub.billedCourts,
          cycle: sub.billingCycle,
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
  // En la prueba no se puede cancelar desde la app (`CANCELABLE`): en vez de
  // un plegable vacío, se dice qué pasa si no hacés nada. blocked/churned no
  // llegan acá (el layout los manda a /suspended).
  const showBaja =
    !!sub && (CANCELABLE.has(sub.status) || sub.status === 'canceled' || sub.status === 'trialing')

  return (
    <div className="space-y-6">
      <SettingsHeader title="Suscripción" />

      {/* "En 3 segundos": lo único que se ve sin plegar nada. La cuota va
          primera y ocupa más ancho porque es la única pregunta que el dueño
          tiene en esta pantalla — "¿cuánto pago?" y "¿cómo lo cambio?". */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {sub && pricing && cuotaMode ? (
            <CuotaSection
              pricing={pricing}
              mode={cuotaMode}
              onlineCourts={onlineCourts}
              billedCourts={sub.billedCourts}
              pendingBilledCourts={sub.pendingBilledCourts}
              periodEnd={new Date(sub.currentPeriodEnd).toISOString()}
              billingCycle={sub.billingCycle}
            />
          ) : (
            <section className="card-premium rounded-xl p-6">
              <h2 className="text-base font-semibold text-foreground">Tu cuota</h2>
              {readOnlyBreakdown && sub ? (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Estás pagando por {sub.billedCourts}{' '}
                    {sub.billedCourts === 1 ? 'cancha' : 'canchas'}. Para cambiarla, primero
                    regularizá el pago.
                  </p>
                  <PriceBreakdown breakdown={readOnlyBreakdown} className="mt-4" />
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

        <div className="space-y-6 lg:col-span-2">
          {sub && (
            <section className="card-premium rounded-xl p-6">
              <h2 className="text-base font-semibold text-foreground">Tu suscripción</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Estado</dt>
                  <dd className="font-medium text-foreground">
                    {SUBSCRIPTION_STATUS_LABEL[sub.status]}
                    {sub.status === 'trialing' && ' · todavía no se cobra'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Canchas facturadas</dt>
                  <dd className="font-medium text-foreground tabular-nums">
                    {sub.billedCourts} · tenés {onlineCourts} prendidas
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
            </section>
          )}
        </div>
      </div>

      {/* Todo lo demás, plegado. */}
      <div className="space-y-3">
        <BillingDisclosure
          title="Pagos de tu cuota"
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
                Ya hay una suscripción de MercadoPago creada para tu cuota. Revisá el método de pago
                conectado en tu cuenta de MercadoPago.
              </span>
            </p>
          )}
          <InvoiceHistorySection invoices={invoices} />
        </BillingDisclosure>

        <BillingDisclosure
          id="cuenta-mp"
          className="scroll-mt-24"
          title="Cuenta de MercadoPago con la que pagás"
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
          <BillingDisclosure
            id="baja"
            className="scroll-mt-24"
            title="Dar de baja TurnoGol"
            summary="Qué pasa y hasta cuándo seguís."
          >
            {sub.status === 'trialing' ? (
              <section className="card-premium rounded-xl p-6">
                <h2 className="text-base font-semibold text-foreground">Dar de baja TurnoGol</h2>
                {/* Sin cuota activada: `expire-trials` pasa el complejo a `blocked`
                    el día que vence la prueba, sin cobrar nada. Con la cuota ya
                    activada hay un preapproval que MercadoPago cobra ese día, y en
                    `trialing` no se puede cancelar desde la app (`CANCELABLE`). */}
                <p className="mt-1 text-sm text-muted-foreground">
                  {sub.mpSubscriptionId
                    ? `Para darte de baja antes del primer cobro, escribinos a ${SUPPORT_EMAIL}.`
                    : `Estás en la prueba gratis hasta el ${formatDate(tenant.trialEndsAt)}. Si no activás la cuota, no se te cobra nada: ese día se cortan el panel y la reserva por internet.`}
                </p>
              </section>
            ) : (
              <CancelSubscriptionSection
                status={sub.status}
                accessUntil={new Date(sub.currentPeriodEnd).toISOString()}
              />
            )}
          </BillingDisclosure>
        )}
      </div>
    </div>
  )
}
