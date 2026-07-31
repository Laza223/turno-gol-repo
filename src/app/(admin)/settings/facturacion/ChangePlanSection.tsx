'use client'

import { useState } from 'react'
import { ArrowRight, ArrowUpRight, ArrowDownRight, CalendarClock } from 'lucide-react'
import { formatArs } from '@/lib/format'
import { PLANS } from '@/app/(business)/precios/plans-data'
import type { ActivatePlanOption } from './ActivatePlanSection'

/**
 * Cambio de plan para una suscripción YA activa.
 *
 * `ActivatePlanSection` cubre el trial (elegir plan por primera vez, vía
 * `/api/billing/subscribe`); esto cubre el después. Sin esta sección, un
 * complejo que arrancó con 2 canchas y creció a 4 no tenía ninguna forma
 * in-app de pasar a un plan más grande: el endpoint existía pero nadie lo
 * llamaba.
 *
 * Son dos caminos con semántica distinta a propósito, y por eso no se
 * unifican en un botón "cambiar plan":
 *   - SUBIR cobra el proraeo de lo que queda del período y se aplica cuando
 *     ese pago se acredita (checkout de MP + webhook).
 *   - BAJAR no cobra nada y se agenda para el fin del período — el complejo ya
 *     pagó hasta esa fecha. Puede quedar bloqueado si tiene más canchas
 *     online que las que soporta el plan destino (409 DOWNGRADE_BLOCKED), y en
 *     ese caso el mensaje del backend ya explica el porqué.
 */

type ChangePlanSectionProps = {
  plans: ActivatePlanOption[]
  currentPlanId: string
  /** `'monthly' | 'annual'` — el ciclo no se cambia acá, sólo el plan. */
  billingCycle: 'monthly' | 'annual'
  /** Cambio ya agendado (downgrade pendiente), si lo hay. */
  pendingPlanId?: string | null
  /** ISO. Cuándo se aplica el cambio agendado / fin del período actual. */
  periodEnd: string
}

type Phase = 'idle' | 'loading' | 'error' | 'scheduled'

/**
 * `timeZone` explícito, no el del runtime. Este componente es `'use client'`
 * pero igual se renderiza en el servidor, y ahí la zona es UTC (Vercel):
 * un `currentPeriodEnd` de las 22:00 ART se vería como el día SIGUIENTE en el
 * HTML del server y como el correcto tras hidratar. Además de la advertencia
 * de hidratación, es una fecha de cobro — mostrarla corrida un día es peor que
 * feo. Fijar ART hace que las dos pasadas rindan el mismo texto.
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

export function ChangePlanSection({
  plans,
  currentPlanId,
  billingCycle,
  pendingPlanId,
  periodEnd,
}: ChangePlanSectionProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null)

  const current = plans.find((p) => p.id === currentPlanId)
  if (!current || plans.length === 0) return null

  const priceOf = (p: ActivatePlanOption): number =>
    billingCycle === 'annual' ? p.priceAnnual : p.priceMonthly

  async function handleChange(target: ActivatePlanOption, direction: 'up' | 'down') {
    setPhase('loading')
    setBusyPlanId(target.id)
    setMessage(null)
    try {
      const res = await fetch(
        direction === 'up' ? '/api/billing/upgrade' : '/api/billing/downgrade',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetPlanId: target.id }),
        },
      )
      // `fetch` NO rechaza ante 4xx/5xx, así que el status se mira siempre y
      // el body se parsea a la defensiva: un 500 puede devolver HTML (página
      // de error del edge, no JSON) y `res.json()` tiraría, dejando al dueño
      // con el error genérico del catch en vez de saber qué pasó.
      const parsed = await res
        .json()
        .then(
          (b) =>
            b as { data?: { checkoutUrl?: string; appliesAt?: string }; error?: { message?: string } },
        )
        .catch(() => ({}) as { data?: undefined; error?: undefined })

      // Subir manda al checkout de MP a pagar el proraeo; el plan cambia
      // recién cuando el webhook confirma ese pago.
      if (res.ok && direction === 'up' && parsed.data?.checkoutUrl) {
        window.location.assign(parsed.data.checkoutUrl)
        return
      }

      // Bajar no cobra: queda agendado para el fin del período.
      if (res.ok && direction === 'down') {
        setPhase('scheduled')
        setBusyPlanId(null)
        setMessage(
          `Listo: pasás al plan ${target.name} el ${formatDate(parsed.data?.appliesAt ?? periodEnd)}. ` +
            'Hasta esa fecha seguís con el plan actual, que ya está pago.',
        )
        return
      }

      setPhase('error')
      setBusyPlanId(null)
      setMessage(parsed.error?.message ?? 'No se pudo cambiar el plan. Intentá de nuevo.')
    } catch {
      setPhase('error')
      setBusyPlanId(null)
      setMessage('No se pudo cambiar el plan. Intentá de nuevo.')
    }
  }

  const pending = pendingPlanId ? plans.find((p) => p.id === pendingPlanId) : null

  return (
    <section className="card-premium rounded-xl p-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Cambiar de plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu plan actual es <span className="font-semibold text-foreground">{current.name}</span>
          {current.maxCourts !== null
            ? ` (hasta ${current.maxCourts} ${current.maxCourts === 1 ? 'cancha' : 'canchas'}).`
            : ' (canchas ilimitadas).'}{' '}
          Si sumaste canchas y no te entran, pasá a uno más grande.
        </p>
      </div>

      {pending && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/60 p-3.5 text-sm text-muted-foreground">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <span>
            Ya tenés agendado el cambio al plan{' '}
            <span className="font-semibold text-foreground">{pending.name}</span> para el{' '}
            {formatDate(periodEnd)}.
          </span>
        </div>
      )}

      {message && (
        <div
          role="alert"
          className={`rounded-lg border p-3.5 text-sm font-medium ${
            phase === 'error'
              ? 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'
              : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {message}
        </div>
      )}

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId
          const staticPlan = PLANS.find((p) => p.slug === plan.slug)
          const direction: 'up' | 'down' = priceOf(plan) > priceOf(current) ? 'up' : 'down'
          const busy = busyPlanId === plan.id

          return (
            <li
              key={plan.id}
              className={`flex h-full flex-col rounded-[20px] border p-5 ${
                isCurrent
                  ? 'border-emerald-400/50 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-900/20'
                  : 'border-border bg-card dark:border-white/9'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-lg font-bold text-foreground">{plan.name}</h3>
                <span className="text-xs font-semibold text-muted-foreground">
                  {staticPlan?.rangeLabel ?? ''}
                </span>
              </div>

              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-2xl font-black tabular-nums text-foreground">
                  {formatArs(priceOf(plan))}
                </span>
                <span className="text-xs font-medium text-muted-foreground">/mes</span>
              </div>

              <div className="mt-4">
                {isCurrent ? (
                  <span className="inline-flex h-10 w-full items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    Tu plan actual
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleChange(plan, direction)}
                    disabled={phase === 'loading'}
                    // Propiedades nombradas en vez de `transition-all`: el anillo
                    // de foco tiene que aparecer al instante, no animarse.
                    className="group inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-card text-xs font-bold text-foreground transition-[background-color,transform] duration-300 hover:bg-accent active:scale-[0.97] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  >
                    {busy
                      ? 'Procesando…'
                      : direction === 'up'
                        ? 'Pasar a este plan'
                        : 'Bajar a este plan'}
                    {direction === 'up' ? (
                      <ArrowUpRight className="h-4 w-4" aria-hidden />
                    ) : (
                      <ArrowDownRight className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                )}
              </div>

              {!isCurrent && (
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  {direction === 'up'
                    ? 'Pagás sólo la diferencia por lo que queda del período. Se aplica al acreditarse el pago.'
                    : `Se aplica el ${formatDate(periodEnd)}, sin cobro: ya pagaste hasta esa fecha.`}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Todos los planes tienen las mismas funciones. Cambia el techo de canchas, nada más.
      </p>
    </section>
  )
}
