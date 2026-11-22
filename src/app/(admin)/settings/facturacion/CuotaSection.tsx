'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, CalendarClock, LockKeyhole, Minus, Plus } from 'lucide-react'
import { formatArs, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmailVerifyBanner } from '@/components/layout/email-verify-banner'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { buildPriceBreakdown, type PricingParams } from '@/modules/billing/pricing'
import type { BillingCycle } from '@/modules/billing/billing.types'
import { SUPPORT_EMAIL } from '@/shared/constants'
import type { ActionResult } from '@/shared/types/action-result'
import { CycleTotal, PriceBreakdown } from './PriceBreakdown'
import styles from './subscription.module.css'

/**
 * La cuota del complejo: el número, de dónde sale y cómo se cambia.
 *
 * Reemplaza a `ActivatePlanSection` (elegir entre Predio/Complejo/Estadio) y a
 * `ChangePlanSection` (grilla de "pasar a" / "bajar a"). Desde la decisión
 * 2026-10-20 hay una cuenta —$30.000 por cada cancha,
 * incluida la primera— y una sola pregunta, por cuántas canchas se
 * factura. Por eso la pantalla es UN control y UN número, y la palabra "plan"
 * no aparece.
 *
 * Tres modos, porque el endpoint y lo que pasa después son distintos:
 *
 * - `activate`: todavía no hay preapproval. `POST /api/billing/subscribe` y el
 *   dueño se va al checkout de MercadoPago. El ciclo se elige acá.
 * - `reactivate`: mismo camino, desde `/reactivar` (`POST /api/billing/reactivate`).
 * - `manage`: ya hay cobro cargado en MP. `POST /api/billing/canchas`, que
 *   NUNCA cobra en el momento (decisión P4): en prueba se aplica ya, con la
 *   suscripción activa se agenda para el próximo cobro. El ciclo no se toca
 *   acá — cambiarlo es rehacer el preapproval, no está en este endpoint.
 */

type CuotaMode = 'activate' | 'reactivate' | 'manage'

const ENDPOINTS: Record<CuotaMode, string> = {
  activate: '/api/billing/subscribe',
  reactivate: '/api/billing/reactivate',
  manage: '/api/billing/canchas',
}

/**
 * Espejo del tope de cordura del server (`billing.schema.ts`). No es un techo
 * de producto —el precio es lineal y sin techo— sino el límite a partir del
 * cual el número solo puede venir de un error. Si divergen, el server manda.
 */
const MAX_BILLED_COURTS = 200

type CuotaSectionProps = {
  pricing: PricingParams
  mode: CuotaMode
  /** Canchas prendidas hoy (`courts WHERE status = 'online'`). Es el piso. */
  onlineCourts: number
  /** Canchas facturadas hoy (`tenant_subscriptions.billed_courts`). */
  billedCourts: number
  /** Cambio ya agendado, si lo hay (`pending_billed_courts`). */
  pendingBilledCourts?: number | null
  /** ISO. Cuándo se aplica lo agendado / cuándo cae el próximo cobro. */
  periodEnd?: string | null
  /** Ciclo vigente. En `manage` se muestra, no se elige. */
  billingCycle?: BillingCycle
  /**
   * Plus por cancha que se está FACTURANDO hoy (`plus.enabled ? perCourtCents : 0`),
   * nunca el flag: el Plus es por cancha, así que cambiar las canchas mueve su monto.
   * OBLIGATORIO a propósito: una pantalla que se olvide de pasarlo no compila, en
   * vez de mostrar el monto sin Plus mientras el débito lo cobra (pasó en /reactivar).
   */
  plusPerCourtCents: number
  /** Jerarquía de precio y controles de Ajustes → Suscripción. */
  subscriptionLayout?: boolean
  /**
   * Mail del dueño y acciones para confirmarlo. Si el server contesta
   * `EMAIL_NOT_VERIFIED`, se ofrece reenviar acá mismo, sin ir a buscar el banner.
   */
  verifyEmail?: {
    email: string
    resendAction: () => Promise<ActionResult>
    changeEmailAction: (newEmail: string) => Promise<ActionResult<{ notice?: string }>>
  }
}

type Phase = 'idle' | 'loading' | 'error' | 'done'
type LimitHint = 'floor' | 'min' | 'max'

/**
 * Lee el JSON de una respuesta cuyo status YA se evaluó. Un 500 del edge
 * devuelve HTML, no JSON: sin este catch el dueño vería "error inesperado" en
 * vez del mensaje real del backend (mismo motivo que en la sección vieja).
 */
async function readJson<T>(res: Response): Promise<T | undefined> {
  try {
    return (await res.json()) as T
  } catch {
    return undefined
  }
}

/**
 * `timeZone` explícito, no el del runtime: este componente es `'use client'`
 * pero igual se renderiza en el servidor, donde la zona es UTC (Vercel). Una
 * fecha de cobro de las 22:00 ART se vería un día corrida en el HTML del
 * server y correcta tras hidratar.
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function courtsLabel(n: number): string {
  return `${n} ${n === 1 ? 'cancha' : 'canchas'}`
}

export function CuotaSection({
  pricing,
  mode,
  onlineCourts,
  billedCourts,
  pendingBilledCourts = null,
  periodEnd = null,
  billingCycle = 'monthly',
  plusPerCourtCents,
  verifyEmail,
  subscriptionLayout = false,
}: CuotaSectionProps) {
  const router = useRouter()

  // El piso es lo que el complejo tiene PRENDIDO: facturar por menos sería
  // operar de más pagando de menos, y el server lo rechaza igual
  // (DOWNGRADE_BLOCKED). Una cancha es el mínimo del modelo.
  const floor = Math.max(1, onlineCourts)
  // Lo que ya está decidido manda sobre el piso sólo si es mayor: si hay un
  // cambio agendado, el número que el dueño quiere ver es ese.
  const [courts, setCourts] = useState(() => Math.max(floor, pendingBilledCourts ?? billedCourts))
  const [cycle, setCycle] = useState<BillingCycle>(billingCycle)
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [limitHint, setLimitHint] = useState<LimitHint | null>(null)

  const breakdown = buildPriceBreakdown({
    billedCourts: courts,
    cycle,
    plusPerCourtCents,
    ...pricing,
  })
  const oneMore = buildPriceBreakdown({
    billedCourts: Math.min(courts + 1, MAX_BILLED_COURTS),
    cycle,
    plusPerCourtCents,
    ...pricing,
  })

  const monthlyFor = (n: number): number =>
    buildPriceBreakdown({ billedCourts: n, cycle, plusPerCourtCents, ...pricing })
      .monthlyEffectiveCents

  const chargeLabel =
    cycle === 'annual'
      ? `${formatArs(breakdown.chargePerCycleCents)} por año`
      : `${formatArs(breakdown.monthlyEffectiveCents)} por mes`

  // En `manage` el destino vigente es el agendado si lo hay: volver a él no
  // cambia nada, y volver al número facturado CANCELA lo agendado (el service
  // lo interpreta así, no hay endpoint aparte de "deshacer").
  const settledTarget = pendingBilledCourts ?? billedCourts
  const nothingToSave = mode === 'manage' && courts === settledTarget

  function step(delta: 1 | -1) {
    setLimitHint(null)
    if (delta === -1 && courts <= floor) {
      setLimitHint(floor > 1 ? 'floor' : 'min')
      return
    }
    if (delta === 1 && courts >= MAX_BILLED_COURTS) {
      setLimitHint('max')
      return
    }
    setCourts(courts + delta)
  }

  async function submit(target: number) {
    setPhase('loading')
    setMessage(null)
    setErrorCode(null)
    setLimitHint(null)
    try {
      const res = await fetch(ENDPOINTS[mode], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'manage'
            ? { billedCourts: target }
            : { billedCourts: target, billingCycle: cycle },
        ),
      })

      // `fetch` no rechaza ante 4xx/5xx: el status se decide ANTES de tocar el
      // body y cada rama lee el suyo.
      if (!res.ok) {
        const body = await readJson<{ error?: { code?: string; message?: string } }>(res)
        setPhase('error')
        setErrorCode(body?.error?.code ?? null)
        // El 501 es el kill switch del feature flag `saas_upgrade`: su mensaje
        // ("no disponible") no le dice al dueño qué hacer, y el dueño no puede
        // hacer nada — el camino es que lo cambiemos nosotros.
        setMessage(
          res.status === 501
            ? `Por ahora el cambio de canchas no se puede hacer solo. Escribinos a ${SUPPORT_EMAIL} y lo ajustamos nosotros en el día.`
            : (body?.error?.message ?? 'No se pudo guardar el cambio. Intentá de nuevo.'),
        )
        return
      }

      if (mode !== 'manage') {
        const body = await readJson<{ data?: { checkoutUrl?: string } }>(res)
        if (body?.data?.checkoutUrl) {
          window.location.assign(body.data.checkoutUrl)
          return
        }
        // 2xx sin checkout no debería pasar; no dejarlo en silencio.
        setPhase('error')
        setMessage('No se pudo abrir el pago. Intentá de nuevo.')
        return
      }

      const body = await readJson<{
        data?: { applied?: boolean; appliesAt?: string | null; billedCourts?: number }
      }>(res)
      const applied = body?.data?.applied === true
      const appliesAt = body?.data?.appliesAt ?? periodEnd
      setPhase('done')
      if (target === billedCourts && pendingBilledCourts !== null) {
        setMessage(
          `Listo: cancelamos el cambio agendado. Seguís pagando por ${courtsLabel(billedCourts)}.`,
        )
      } else if (applied) {
        setMessage(
          `Listo: tu cuota es de ${formatArs(monthlyFor(target))} por mes, por ${courtsLabel(target)}.`,
        )
      } else {
        setMessage(
          `Listo: desde el ${appliesAt ? formatDate(appliesAt) : 'próximo cobro'} pagás ${formatArs(monthlyFor(target))} por mes. Hasta esa fecha no cambia nada y no te cobramos nada extra.`,
        )
      }
      // El aviso de cambio agendado lo arma el server con `pending_billed_courts`.
      router.refresh()
    } catch {
      setPhase('error')
      setMessage('No se pudo guardar el cambio. Intentá de nuevo.')
    }
  }

  const ctaLabel =
    mode === 'manage'
      ? 'Guardar'
      : subscriptionLayout
        ? 'Activar plan'
        : `${mode === 'activate' ? 'Activar' : 'Reactivar'} · ${chargeLabel}`
  const price = <PriceBreakdown breakdown={breakdown} receipt={subscriptionLayout} />
  const cycleControl =
    mode === 'manage' ? (
      <p className="text-xs text-muted-foreground">
        {cycle === 'annual' ? 'Facturación anual.' : 'Facturación mensual.'} Para cambiarla,
        escribinos a {SUPPORT_EMAIL}.
      </p>
    ) : (
      <SegmentedControl<BillingCycle>
        aria-label="Cómo querés pagar"
        value={cycle}
        onValueChange={setCycle}
        disabled={phase === 'loading'}
        className={
          subscriptionLayout
            ? styles.cycleControl
            : 'inline-flex w-full items-center gap-1 rounded-full border border-border bg-muted p-1.5 sm:w-auto'
        }
        options={[
          { value: 'monthly', label: 'Mensual' },
          {
            value: 'annual',
            label:
              pricing.annualDiscountBps > 0 ? (
                <>
                  Anual{' '}
                  <span className={subscriptionLayout ? styles.saving : undefined}>
                    · {formatPct(pricing.annualDiscountBps / 100)} menos
                  </span>
                </>
              ) : (
                'Anual'
              ),
          },
        ]}
        itemClassName={(active) =>
          subscriptionLayout
            ? styles.cycleOption
            : cn(
                'inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )
        }
      />
    )

  return (
    <section
      className={
        subscriptionLayout
          ? styles.receipt
          : 'card-premium space-y-3 rounded-xl p-4 sm:p-6 lg:space-y-6'
      }
    >
      <header>
        <h2
          className={cn(
            'font-semibold text-foreground',
            subscriptionLayout ? 'font-display text-xl tracking-tight' : 'text-base',
          )}
        >
          {subscriptionLayout && mode === 'activate' ? 'Cuota al activar' : 'Tu cuota'}
        </h2>
        {subscriptionLayout ? (
          <CycleTotal breakdown={breakdown} />
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Pagás por cancha. Sin planes, sin sorpresas.
          </p>
        )}
      </header>

      {pendingBilledCourts !== null && pendingBilledCourts !== billedCourts && periodEnd && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3.5 text-sm text-muted-foreground">
          <CalendarClock
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <span>
            Desde el <span className="font-semibold text-foreground">{formatDate(periodEnd)}</span>{' '}
            pasás a pagar por{' '}
            <span className="font-semibold text-foreground">
              {courtsLabel(pendingBilledCourts)}
            </span>{' '}
            ({formatArs(monthlyFor(pendingBilledCourts))} por mes).{' '}
            <button
              type="button"
              onClick={() => {
                setCourts(billedCourts)
                void submit(billedCourts)
              }}
              disabled={phase === 'loading'}
              className="font-semibold text-primary underline underline-offset-2 hover:text-emerald-700 disabled:opacity-60 dark:hover:text-emerald-300"
            >
              Deshacer
            </button>
          </span>
        </div>
      )}

      {subscriptionLayout && cycleControl}

      {/* Canchas */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between',
          subscriptionLayout ? styles.courtRow : 'gap-4',
        )}
      >
        <div className="min-w-0">
          <span id="cuota-canchas-label" className="text-sm font-medium text-foreground">
            {subscriptionLayout ? 'Canchas en la cuota' : 'Canchas'}
          </span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {onlineCourts > 0
              ? `${courtsLabel(onlineCourts)} en actividad`
              : 'Todavía no prendiste ninguna cancha'}
          </p>
        </div>

        <div
          role="group"
          aria-labelledby="cuota-canchas-label"
          className={cn(
            'inline-flex items-center rounded-full border border-border bg-muted',
            subscriptionLayout ? styles.stepper : 'gap-2 p-1.5',
          )}
        >
          {/* Stepper y no una fila de botones: sin techo, "1 a 7" no escala y
              obliga a inventar un "7+" que miente sobre el precio. */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-full"
            disabled={phase === 'loading'}
            onClick={() => step(-1)}
            aria-label="Quitar una cancha"
          >
            <Minus className="h-4 w-4" aria-hidden />
          </Button>
          <span className="w-12 text-center font-display text-2xl font-bold tabular-nums text-foreground">
            {courts}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-full"
            disabled={phase === 'loading'}
            onClick={() => step(1)}
            aria-label="Agregar una cancha"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      {limitHint && (
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          {limitHint === 'floor' && (
            <>
              Tu cuota tiene que cubrir las canchas que tenés prendidas. Para pagar por menos, apagá
              las que no estés usando en{' '}
              <Link href="/canchas" className="font-semibold underline underline-offset-2">
                Canchas
              </Link>{' '}
              y volvé.
            </>
          )}
          {limitHint === 'min' && <>Una cancha es el mínimo.</>}
          {limitHint === 'max' && <>{MAX_BILLED_COURTS} canchas es el máximo.</>}
        </p>
      )}

      {/* El número grande y de dónde sale. */}
      {!subscriptionLayout && price}

      {!subscriptionLayout && cycleControl}
      {subscriptionLayout && price}

      {/* La promesa comercial del modelo, escrita. No es relleno: es la razón
          por la que sumar una cancha no da miedo (decisión P4). */}
      {!subscriptionLayout && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Si sumás una cancha, tu cuota pasa a{' '}
          <span className="font-semibold tabular-nums text-foreground">
            {formatArs(oneMore.monthlyEffectiveCents)}
          </span>{' '}
          desde tu próximo cobro. Nunca te cobramos de más en el medio del mes.
        </p>
      )}

      {subscriptionLayout && mode === 'manage' && courts !== settledTarget && (
        <p className="text-xs text-muted-foreground">
          El cambio de cuota no genera un cobro en este momento.
        </p>
      )}

      {message && (
        <div
          role="alert"
          className={`flex flex-col gap-3 rounded-lg border p-3.5 text-sm font-medium sm:flex-row sm:items-center sm:justify-between ${
            phase === 'error'
              ? 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400'
              : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          }`}
        >
          <span>{message}</span>
          {phase === 'error' && errorCode === 'DOWNGRADE_BLOCKED' && (
            <Link
              href="/canchas"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-red-700"
            >
              Ir a Canchas <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
          {/* El email de la cuenta de MercadoPago del dueño puede estar tomado
              en `auth.users` por su propia cuenta de jugador: desde la migr. 078
              la salida es declararlo acá abajo, sin tocar el de login. El ancla
              `#cuenta-mp` existe en las DOS páginas que montan esta sección. */}
          {phase === 'error' && message.toLowerCase().includes('email') && (
            <a
              href="#cuenta-mp"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-red-700"
            >
              Cargar mi cuenta de MercadoPago <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
        </div>
      )}

      {phase === 'error' && errorCode === 'EMAIL_NOT_VERIFIED' && verifyEmail && (
        <div className="overflow-hidden rounded-lg border border-amber-500/30">
          <EmailVerifyBanner {...verifyEmail} inPanel={false} />
        </div>
      )}

      <div className={subscriptionLayout ? 'space-y-2.5' : undefined}>
        <Button
          type="button"
          size="lg"
          className={cn('w-full', subscriptionLayout && styles.confirm)}
          onClick={() => void submit(courts)}
          isLoading={phase === 'loading'}
          disabled={nothingToSave}
          aria-describedby={
            subscriptionLayout && mode === 'activate' ? 'cuota-checkout-help' : undefined
          }
        >
          {phase === 'loading'
            ? mode === 'manage'
              ? 'Guardando…'
              : mode === 'activate'
                ? 'Activando…'
                : 'Reactivando…'
            : ctaLabel}
          {subscriptionLayout && mode === 'activate' && phase !== 'loading' && (
            <ArrowRight className="size-4" aria-hidden />
          )}
        </Button>
        {subscriptionLayout && mode === 'activate' && (
          <p
            id="cuota-checkout-help"
            className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"
          >
            <LockKeyhole className="size-3.5 shrink-0" aria-hidden />
            Confirmás el pago en Mercado Pago.
          </p>
        )}
      </div>

      {/* El cambio se anuncia una sola vez y completo: el stepper por su cuenta
          no dice cuánto pasa a costar. */}
      <p className="sr-only" aria-live="polite">
        {courtsLabel(courts)}: {chargeLabel}.
      </p>
    </section>
  )
}
