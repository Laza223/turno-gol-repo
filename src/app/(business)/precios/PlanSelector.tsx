'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { formatArs } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { PLUS_LIST_PER_COURT_CENTS } from '@/modules/billing/pricing'
import { FREE_ONLINE_BOOKINGS_PER_MONTH, SUPPORT_WHATSAPP_URL } from '@/shared/constants'
import { annualSavings, planForCourts, type BillingCycle, type PlanCard } from './plans-data'

/** Accesos rápidos; el campo permite cualquier cantidad exacta. */
const COURT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const

/**
 * Selector de cantidad exacta de canchas y ciclo de facturación, con los tres
 * planes lado a lado (decisión 2026-11-08, "tres planes"): Gratis, Completo
 * (destacado, el que se vende) y Completo + WhatsApp (el ancla). Los montos no
 * cambian: Completo es el precio por cancha y WhatsApp suma el Plus de lista.
 */
export default function PlanSelector() {
  const [courts, setCourts] = useState(3)
  const [courtInput, setCourtInput] = useState('3')
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const active = planForCourts(courts)

  return (
    <div>
      {/* Controles */}
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <span
            id="courts-label"
            className="font-logo text-[12.5px] font-bold uppercase tracking-[.12em] text-emerald-400"
          >
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
                  onClick={() => {
                    setCourts(n)
                    setCourtInput(String(n))
                  }}
                  className={`h-11 w-11 rounded-full text-sm font-bold tabular-nums transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                    selected
                      ? 'bg-emerald-500 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,.45)]'
                      : 'text-slate-400 hover:bg-white/[.07] hover:text-white'
                  }`}
                >
                  {n}
                </button>
              )
            })}
          </div>
          <Input
            type="number"
            min={1}
            step={1}
            value={courtInput}
            aria-label="Cantidad exacta de canchas"
            onChange={(event) => {
              setCourtInput(event.target.value)
              const count = event.target.valueAsNumber
              if (Number.isInteger(count) && count >= 1) setCourts(count)
            }}
            className="w-28 rounded-full border-white/10 bg-white/4 text-center text-white"
          />
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
            const selected = cycle === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setCycle(value)}
                className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                  selected ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
                {value === 'annual' && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      selected
                        ? 'bg-slate-950/20 text-slate-950'
                        : 'bg-emerald-500/15 text-emerald-400'
                    }`}
                  >
                    −10%
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Anuncio del plan resultante (refuerzo + screen readers) */}
        <p aria-live="polite" className="text-center text-[15px] text-slate-400">
          Precios para {courts} {courts === 1 ? 'cancha' : 'canchas'}.
        </p>
      </div>

      {/* Cards: en el celular, Completo primero (es el que se vende). */}
      <div className="mx-auto mt-10 grid max-w-[1180px] grid-cols-1 gap-6 md:grid-cols-3 md:items-stretch">
        <div className="order-2 md:order-1">
          <FreeCardView />
        </div>
        <div className="order-1 md:order-2">
          <PlanCardView plan={active} cycle={cycle} isActive />
        </div>
        <div className="order-3">
          <WhatsappCardView plan={active} courts={courts} cycle={cycle} />
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <p
          className="inline-flex max-w-[680px] items-center gap-3 rounded-2xl border border-emerald-500/20 px-5 py-3.5 text-center text-[14.5px] leading-snug text-slate-300"
          style={{ background: 'rgba(16,185,129,.06)' }}
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
          <span>
            <span className="font-semibold text-white">
              Todos arrancan con 30 días de Completo.
            </span>{' '}
            Si después no pagás, seguís en Gratis y tus datos quedan guardados.
          </span>
        </p>
      </div>
    </div>
  )
}

const CARD_IDLE_STYLE = {
  borderRadius: '20px',
  background: 'linear-gradient(180deg, rgba(15,23,42,.6), rgba(2,6,23,.7))',
}

const PRICE_STYLE = {
  fontSize: 'clamp(38px, 3.6vw, 46px)',
  letterSpacing: '-0.02em',
  lineHeight: 1,
}

const SECONDARY_CTA =
  'group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 text-sm font-bold text-white transition-all duration-300 hover:bg-white/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:scale-[0.97] whitespace-nowrap'

function FeatureList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-5 flex-1 space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-[14px] leading-snug text-slate-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  )
}

const FREE_FEATURES = [
  'Aparecés en el buscador de TurnoGol y en RIVAL',
  `Tus jugadores te reservan online, hasta ${FREE_ONLINE_BOOKINGS_PER_MONTH} turnos por mes`,
  'Marcás en la grilla los horarios ocupados',
  'Sin vencimiento',
] as const

const FULL_FEATURES = [
  'Reservas online sin tope',
  'Anotás tus turnos con nombre y precio',
  'Fijos, caja, cantina y jugadores',
  'Tu encargado entra con su usuario',
  'Métricas y soporte por WhatsApp',
] as const

function FreeCardView() {
  return (
    <div
      className="relative flex h-full flex-col border border-white/9 p-7"
      style={CARD_IDLE_STYLE}
    >
      <h2 className="font-display text-2xl font-bold text-[#f8fafc]">Gratis</h2>
      <div className="mt-6 flex items-baseline gap-2">
        <span className="font-display font-black tabular-nums text-[#f8fafc]" style={PRICE_STYLE}>
          {formatArs(0)}
        </span>
        <span className="text-sm font-medium text-slate-400">/mes</span>
      </div>
      <div className="mt-2 text-[13px] text-slate-400">Para aparecer donde buscan cancha</div>
      <FeatureList items={FREE_FEATURES} />
      <div className="mt-6">
        <Link href="/register" className={SECONDARY_CTA}>
          Empezar gratis
        </Link>
        <p className="mt-3 text-center text-xs text-slate-500">
          Las condiciones del gratis pueden cambiar con 30 días de aviso
        </p>
      </div>
    </div>
  )
}

function WhatsappCardView({
  plan,
  courts,
  cycle,
}: {
  plan: PlanCard
  courts: number
  cycle: BillingCycle
}) {
  const plus = PLUS_LIST_PER_COURT_CENTS * courts
  const monthly = cycle === 'monthly'
  return (
    <div
      className="relative flex h-full flex-col border border-white/9 p-7"
      style={CARD_IDLE_STYLE}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-[#f8fafc]">Completo + WhatsApp</h2>
      </div>
      <div className="mt-6">
        {monthly ? (
          <div className="flex items-baseline gap-2">
            <span
              className="font-display font-black tabular-nums text-[#f8fafc]"
              style={PRICE_STYLE}
            >
              {formatArs(plan.priceMonthly + plus)}
            </span>
            <span className="text-sm font-medium text-slate-400">/mes</span>
          </div>
        ) : (
          <div className="font-display text-xl font-bold text-[#f8fafc]">
            Completo + {formatArs(plus)}/mes
          </div>
        )}
        <div className="mt-2 text-[13px] text-slate-400">
          {formatArs(PLUS_LIST_PER_COURT_CENTS)} más por cancha
        </div>
      </div>
      <FeatureList
        items={[
          'Todo lo de Completo',
          'Un asistente atiende tu WhatsApp y toma reservas a cualquier hora',
          'Responde con tus horarios y precios reales',
        ]}
      />
      <div className="mt-6">
        <a
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={SECONDARY_CTA}
        >
          Escribinos
        </a>
        <p className="mt-3 text-center text-xs text-slate-500">Lo sumás cuando quieras</p>
      </div>
    </div>
  )
}

function PlanCardView({
  plan,
  cycle,
  isActive,
}: {
  plan: PlanCard
  cycle: BillingCycle
  isActive: boolean
}) {
  const annual = cycle === 'annual'
  const price = annual ? plan.priceAnnual : plan.priceMonthly

  return (
    <div
      className={`relative flex h-full flex-col p-7 transition-all duration-300 ${
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
          Recomendado
        </span>
      )}

      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-[#f8fafc]">Completo</h2>
        <span className="text-[13px] font-semibold text-slate-400">{plan.rangeLabel}</span>
      </div>

      <div className="mt-6">
        {annual ? (
          <div>
            <div className="text-[13px] font-semibold text-slate-500">
              <s>{formatArs(plan.priceMonthly)}/mes</s>
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className="font-display font-black tabular-nums text-[#f8fafc]"
                style={{
                  fontSize: 'clamp(38px, 3.6vw, 46px)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}
              >
                {formatArs(price)}
              </span>
              <span className="text-sm font-medium text-slate-400">/mes</span>
            </div>
            <div className="mt-2 text-[13px] font-medium text-slate-300">
              Total:{' '}
              <span className="font-bold text-white">{formatArs(plan.priceAnnual * 12)}</span> /año
              (pago único)
            </div>
            <div className="mt-1 text-[13px] font-semibold text-[#6ee7b7]">
              Ahorrás {formatArs(annualSavings(plan))} al año
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-2">
              <span
                className="font-display font-black tabular-nums text-[#f8fafc]"
                style={{
                  fontSize: 'clamp(38px, 3.6vw, 46px)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}
              >
                {formatArs(price)}
              </span>
              <span className="text-sm font-medium text-slate-400">/mes</span>
            </div>
            <div className="mt-2 text-[13px] text-slate-400">Facturación mensual</div>
          </div>
        )}
      </div>

      <FeatureList items={FULL_FEATURES} />

      <div className="mt-6">
        <Link
          href="/register"
          className={`group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-bold transition-all duration-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 whitespace-nowrap ${
            isActive
              ? 'border border-emerald-400/60 bg-emerald-500/5 text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.15)] hover:bg-emerald-500/15 hover:border-emerald-400 hover:shadow-[0_0_24px_rgba(16,185,129,0.3)] active:scale-[0.97]'
              : 'border border-white/15 bg-white/5 text-white hover:bg-white/10 active:scale-[0.97]'
          }`}
        >
          Empezar 30 días gratis
          <ArrowRight
            className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
            aria-hidden
          />
        </Link>
        <p className="mt-3 text-center text-xs text-slate-500">
          Sin tarjeta · Cancelás cuando quieras
        </p>
      </div>
    </div>
  )
}
