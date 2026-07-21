'use client'

import { useState } from 'react'
import { formatArs } from '@/lib/format'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { PLANS, planForCourts } from '@/app/(business)/precios/plans-data'

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

type ActivatePlanSectionProps = {
  plans: ActivatePlanOption[]
  defaultCourts?: number
  endpoint?: string
  title?: string
  description?: string
  ctaLabel?: string
  ctaLoadingLabel?: string
}

/** 8 representa "8 o más" (Estadio, ilimitado). */
const COURT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const

export function ActivatePlanSection({
  plans,
  defaultCourts = 3,
  endpoint = '/api/billing/subscribe',
  title = 'Activar plan',
  description = 'Elegí tu plan para seguir facturando cuando termine el período de prueba.',
  ctaLabel = 'Activar plan',
  ctaLoadingLabel = 'Activando…',
}: ActivatePlanSectionProps) {
  const [courts, setCourts] = useState(defaultCourts)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [activatingPlanId, setActivatingPlanId] = useState<string | null>(null)

  if (plans.length === 0) return null

  const activeStaticPlan = planForCourts(courts)

  async function handleActivate(planId: string) {
    setStatus('loading')
    setActivatingPlanId(planId)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, billingCycle }),
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
      setActivatingPlanId(null)
      setError(parsed.error?.message ?? 'No se pudo activar el plan. Intentá de nuevo.')
    } catch {
      setStatus('error')
      setActivatingPlanId(null)
      setError('No se pudo activar el plan. Intentá de nuevo.')
    }
  }

  return (
    <section className="card-premium rounded-xl p-6 space-y-8">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3.5 text-sm font-medium text-red-600 dark:text-red-400"
        >
          <span>{error}</span>
          {error.toLowerCase().includes('email') && (
            <a
              href="/settings/equipo"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors shadow-xs"
            >
              Ir a Equipo <ArrowRight className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <span id="courts-label" className="font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400">
            ¿Cuántas canchas tenés?
          </span>
          <div
            role="radiogroup"
            aria-labelledby="courts-label"
            className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-white/10 bg-white/4 p-1.5 backdrop-blur-xs"
          >
            {COURT_OPTIONS.map((n) => {
              const selected = courts === n
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setCourts(n)}
                  className={`h-11 w-11 rounded-full text-sm font-bold tabular-nums transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    selected
                      ? 'bg-emerald-505 bg-emerald-500 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,.45)] font-bold'
                      : 'text-slate-400 hover:bg-white/[.07] hover:text-white'
                  }`}
                >
                  {n === 8 ? '8+' : n}
                </button>
              )
            })}
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label="Ciclo de facturación"
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/4 p-1.5 backdrop-blur-xs"
        >
          {(
            [
              { value: 'monthly', label: 'Mensual' },
              { value: 'annual', label: 'Anual' },
            ] as const
          ).map(({ value, label }) => {
            const selected = billingCycle === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setBillingCycle(value)}
                className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  selected ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
                {value === 'annual' && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      selected ? 'bg-slate-950/20 text-slate-950' : 'bg-emerald-500/15 text-emerald-400'
                    }`}
                  >
                    −20%
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Anuncio del plan resultante (refuerzo + screen readers) */}
        <p aria-live="polite" className="text-center text-sm text-slate-400">
          Para {courts === 8 ? '8 o más' : courts} {courts === 1 ? 'cancha' : 'canchas'}, tu plan sugerido es{' '}
          <span className="font-semibold text-[#6ee7b7]">
            {plans.find((p) => p.slug === activeStaticPlan.slug)?.name ?? activeStaticPlan.name}
          </span>.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {plans.map((dbPlan) => {
          const staticPlan = PLANS.find((p) => p.slug === dbPlan.slug) ?? {
            name: dbPlan.name,
            rangeLabel: '',
            sizeLine: '',
            priceMonthly: dbPlan.priceMonthly,
            priceAnnual: dbPlan.priceAnnual,
          }
          const isActive = dbPlan.slug === activeStaticPlan.slug
          const annual = billingCycle === 'annual'
          const price = annual ? dbPlan.priceAnnual : dbPlan.priceMonthly
          const perDay = Math.round(price / 30)
          const isActivating = activatingPlanId === dbPlan.id

          return (
            <div
              key={dbPlan.id}
              className={`relative flex h-full flex-col p-6 transition-all duration-300 ${
                isActive ? 'border border-emerald-400/50 md:scale-[1.02]' : 'border border-white/9'
              }`}
              style={{
                borderRadius: '20px',
                background: isActive
                  ? 'linear-gradient(180deg, rgba(6,78,59,.32), rgba(2,6,23,.85))'
                  : 'linear-gradient(180deg, rgba(15,23,42,.6), rgba(2,6,23,.7))',
                boxShadow: isActive
                  ? '0 0 50px rgba(16,185,129,.22), inset 0 1px 0 rgba(255,255,255,.08)'
                  : undefined,
              }}
            >
              {isActive && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-500 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[.08em] text-slate-950 shadow-[0_6px_20px_rgba(16,185,129,.45)]">
                  Sugerido para tus canchas
                </span>
              )}

              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-xl font-bold text-[#f8fafc]">{dbPlan.name}</h3>
                <span className="text-xs font-semibold text-slate-400">{staticPlan.rangeLabel}</span>
              </div>

              <div className="mt-5">
                {annual && (
                  <div className="text-sm font-semibold text-slate-500">
                    <s>{formatArs(dbPlan.priceMonthly)}</s>
                  </div>
                )}
                <div className="flex items-baseline gap-2">
                  <span
                    className="font-display font-black tabular-nums text-[#f8fafc] text-3xl"
                    style={{ letterSpacing: '-0.02em', lineHeight: 1 }}
                  >
                    {formatArs(price)}
                  </span>
                  <span className="text-xs font-medium text-slate-400">/mes</span>
                </div>
                <div className="mt-1.5 text-xs text-slate-500">
                  ≈ {formatArs(perDay)} por día
                </div>
                {annual && (
                  <div className="mt-1.5 text-xs font-semibold text-[#6ee7b7]">
                    Ahorrás {formatArs((dbPlan.priceMonthly - dbPlan.priceAnnual) * 12)} al año
                  </div>
                )}
              </div>

              <p className="mt-4 flex-1 text-xs leading-relaxed text-slate-400">{staticPlan.sizeLine}</p>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => handleActivate(dbPlan.id)}
                  disabled={status === 'loading'}
                  className={`group inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-xs font-bold transition-all duration-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 shadow-[0_0_16px_rgba(16,185,129,0.15)] hover:bg-emerald-400 active:scale-[0.97]'
                      : 'border border-white/15 bg-white/5 text-white hover:bg-white/10 active:scale-[0.97]'
                  }`}
                >
                  {isActivating ? ctaLoadingLabel : ctaLabel}
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                    aria-hidden
                  />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Todos los planes tienen todo */}
      <div className="flex justify-center">
        <p
          className="inline-flex max-w-[640px] items-center gap-3 rounded-2xl border border-emerald-500/20 px-5 py-3.5 text-center text-xs leading-snug text-slate-300"
          style={{ background: 'rgba(16,185,129,.06)' }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
          <span>
            <span className="font-semibold text-white">Todos los planes tienen todo.</span> Pagás por tamaño,
            no por funciones recortadas.
          </span>
        </p>
      </div>
    </section>
  )
}
