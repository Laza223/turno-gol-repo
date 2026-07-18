'use client'

import { useState } from 'react'
import { formatArs } from '@/lib/format'

export type ActivatePlanOption = {
  id: string
  slug: string
  name: string
  maxCourts: number | null
  /** Centavos ARS/mes. */
  priceMonthly: number
  /** Centavos ARS/mes pagando el ciclo anual. */
  priceAnnual: number
}

type BillingCycle = 'monthly' | 'annual'

/** Rango de canchas derivado del maxCourts de cada plan (ordenados por precio). */
function courtRangeLabel(plans: ActivatePlanOption[], plan: ActivatePlanOption): string {
  const sorted = [...plans].sort((a, b) => a.priceMonthly - b.priceMonthly)
  const idx = sorted.findIndex((p) => p.id === plan.id)
  const prevMax = idx > 0 ? sorted[idx - 1]!.maxCourts : 0
  const min = (prevMax ?? 0) + 1
  if (plan.maxCourts === null) return `${min}+ canchas`
  if (min === plan.maxCourts) return `${min} cancha`
  return `${min}-${plan.maxCourts} canchas`
}

const CHIP_ACTIVE =
  'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold shadow-xs shadow-emerald-500/10'
const CHIP_INACTIVE =
  'border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground'

type ActivatePlanSectionProps = {
  plans: ActivatePlanOption[]
  /**
   * Route handler al que postea el formulario. Default `/api/billing/subscribe`
   * (fix 1b — activación desde `trialing`). ENS-20 reusa este mismo componente
   * en `/reactivar` apuntando a `/api/billing/reactivate` (recovery desde
   * canceled/churned/suspended/blocked): mismo payload `{planId, billingCycle}`,
   * misma respuesta `{data:{checkoutUrl}}`.
   */
  endpoint?: string
  title?: string
  description?: string
  ctaLabel?: string
  ctaLoadingLabel?: string
}

/**
 * Fix 1b: con la fila de tenant_subscriptions ya sembrada en 'trialing' (fix
 * 1a), el admin necesita una forma de activar el plan real. Pega directo al
 * route handler (`endpoint`) — no hay Server Action para esto.
 */
export function ActivatePlanSection({
  plans,
  endpoint = '/api/billing/subscribe',
  title = 'Activar plan',
  description = 'Elegí tu plan para seguir facturando cuando termine el período de prueba.',
  ctaLabel = 'Activar plan',
  ctaLoadingLabel = 'Activando…',
}: ActivatePlanSectionProps) {
  const [selectedPlanId, setSelectedPlanId] = useState(plans[0]?.id ?? '')
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  if (plans.length === 0) return null

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? plans[0]!
  const price = billingCycle === 'annual' ? selectedPlan.priceAnnual : selectedPlan.priceMonthly

  async function handleActivate() {
    setStatus('loading')
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlanId, billingCycle }),
      })
      const parsed = (await res.json()) as {
        data?: { checkoutUrl?: string }
        error?: { message?: string }
      }
      if (res.status === 201 && parsed.data?.checkoutUrl) {
        window.location.assign(parsed.data.checkoutUrl)
        return
      }
      setStatus('error')
      setError(parsed.error?.message ?? 'No se pudo activar el plan. Intentá de nuevo.')
    } catch {
      setStatus('error')
      setError('No se pudo activar el plan. Intentá de nuevo.')
    }
  }

  return (
    <section className="card-premium rounded-xl p-6">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {plans.map((plan) => {
          const active = plan.id === selectedPlanId
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlanId(plan.id)}
              className={`h-11 px-5 rounded-xl border text-sm font-medium transition-all duration-200 ${active ? CHIP_ACTIVE : CHIP_INACTIVE}`}
            >
              {plan.name} — {courtRangeLabel(plans, plan)}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setBillingCycle('monthly')}
          className={`h-10 px-4 rounded-xl border text-sm font-medium transition-all duration-200 ${billingCycle === 'monthly' ? CHIP_ACTIVE : CHIP_INACTIVE}`}
        >
          Mensual
        </button>
        <button
          type="button"
          onClick={() => setBillingCycle('annual')}
          className={`h-10 px-4 rounded-xl border text-sm font-medium transition-all duration-200 ${billingCycle === 'annual' ? CHIP_ACTIVE : CHIP_INACTIVE}`}
        >
          Anual
        </button>
      </div>

      <p className="mt-3 text-sm text-foreground">
        <span className="text-lg font-semibold tabular-nums">{formatArs(price)}</span>
        <span className="text-muted-foreground">/mes</span>
        {billingCycle === 'annual' && (
          <span className="ml-2 text-xs text-muted-foreground">(pagando el año)</span>
        )}
      </p>

      <button
        type="button"
        onClick={handleActivate}
        disabled={status === 'loading'}
        className="mt-4 inline-flex h-11 md:h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'loading' ? ctaLoadingLabel : ctaLabel}
      </button>

      {status === 'error' && error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  )
}
