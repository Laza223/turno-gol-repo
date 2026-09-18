'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, CalendarClock, Minus, Plus } from 'lucide-react'
import { formatArs, formatPct } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { buildPriceBreakdown, type PricingParams } from '@/modules/billing/pricing'
import type { BillingCycle } from '@/modules/billing/billing.types'
import { SUPPORT_EMAIL } from '@/shared/constants'
import { PriceBreakdown } from './PriceBreakdown'

/**
 * La cuota del complejo: el número, de dónde sale y cómo se cambia.
 *
 * Reemplaza a `ActivatePlanSection` (elegir entre Predio/Complejo/Estadio) y a
 * `ChangePlanSection` (grilla de "pasar a" / "bajar a"). Desde la decisión
 * 2026-09-17 no hay planes: hay una cuenta —$47.000 la primera cancha +
 * $30.000 cada cancha extra— y una sola pregunta, por cuántas canchas se
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

  const breakdown = buildPriceBreakdown({ billedCourts: courts, cycle, ...pricing })
  const oneMore = buildPriceBreakdown({
    billedCourts: Math.min(courts + 1, MAX_BILLED_COURTS),
    cycle,
    ...pricing,
  })

  const monthlyFor = (n: number): number =>
    buildPriceBreakdown({ billedCourts: n, cycle, ...pricing }).monthlyEffectiveCents

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
      : `${mode === 'activate' ? 'Activar' : 'Reactivar'} — ${chargeLabel}`

  return (
    <section className="card-premium space-y-6 rounded-xl p-6">
      <header>
        <h2 className="text-base font-semibold text-foreground">Tu cuota</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pagás por cancha. Sin planes, sin sorpresas.
        </p>
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

      {/* Canchas */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <span id="cuota-canchas-label" className="text-sm font-medium text-foreground">
            Canchas
          </span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {onlineCourts > 0
              ? `Tenés ${courtsLabel(onlineCourts)} prendidas`
              : 'Todavía no prendiste ninguna cancha'}
          </p>
        </div>

        <div
          role="group"
          aria-labelledby="cuota-canchas-label"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-muted p-1.5"
        >
          {/* Stepper y no una fila de botones: sin techo, "1 a 7" no escala y
              obliga a inventar un "7+" que miente sobre el precio. */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-full"
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
      <PriceBreakdown breakdown={breakdown} />

      {/* Un cambio de ciclo rehace el preapproval: con cobro ya cargado en MP
          no se ofrece acá (el endpoint de canchas ni lo acepta). */}
      {mode === 'manage' ? (
        <p className="text-xs text-muted-foreground">
          {cycle === 'annual' ? 'Pagás por año.' : 'Pagás por mes.'} Para cambiar cómo pagás,
          escribinos a {SUPPORT_EMAIL}.
        </p>
      ) : (
        <SegmentedControl<BillingCycle>
          aria-label="Cómo querés pagar"
          value={cycle}
          onValueChange={setCycle}
          className="inline-flex w-full items-center gap-1 rounded-full border border-border bg-muted p-1.5 sm:w-auto"
          options={[
            { value: 'monthly', label: 'Mensual' },
            {
              value: 'annual',
              // El 10% sale de `annual_discount_bps`, nunca escrito a mano.
              label: `Anual — pagás ${formatPct(pricing.annualDiscountBps / 100)} menos`,
            },
          ]}
          itemClassName={(active) =>
            // `min-h-11` y no `h-11`: en 375px "Anual — pagás 10% menos" se
            // parte en dos líneas y una altura fija lo cortaría.
            `inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 py-2 text-center text-sm font-semibold leading-tight transition-colors duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:flex-none ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`
          }
        />
      )}

      {/* La promesa comercial del modelo, escrita. No es relleno: es la razón
          por la que sumar una cancha no da miedo (decisión P4). */}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Si sumás una cancha, tu cuota pasa a{' '}
        <span className="font-semibold tabular-nums text-foreground">
          {formatArs(oneMore.monthlyEffectiveCents)}
        </span>{' '}
        desde tu próximo cobro. Nunca te cobramos de más en el medio del mes.
      </p>

      {message && (
        <div
          role="alert"
          className={`flex flex-col gap-3 rounded-lg border p-3.5 text-sm font-medium sm:flex-row sm:items-center sm:justify-between ${
            phase === 'error'
              ? 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'
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

      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={() => void submit(courts)}
        isLoading={phase === 'loading'}
        disabled={nothingToSave}
      >
        {phase === 'loading'
          ? mode === 'manage'
            ? 'Guardando…'
            : mode === 'activate'
              ? 'Activando…'
              : 'Reactivando…'
          : ctaLabel}
      </Button>

      {/* El cambio se anuncia una sola vez y completo: el stepper por su cuenta
          no dice cuánto pasa a costar. */}
      <p className="sr-only" aria-live="polite">
        {courtsLabel(courts)}: {chargeLabel}.
      </p>
    </section>
  )
}
