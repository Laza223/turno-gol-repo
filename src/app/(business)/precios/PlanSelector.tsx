'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, Check, CheckCircle2 } from 'lucide-react'
import { usePointerGlow } from '@/components/world/use-pointer-glow'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { badgeVariants } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { GLASS_INPUT } from '@/components/world/portal-auth-styles'
import {
  annualMonthlyEquivalent,
  MAX_CATALOG_COURTS,
  monthlyListAmount,
  PLUS_LIST_PER_COURT_CENTS,
  type PricingParams,
} from '@/modules/billing/pricing'
import { contactWhatsappUrl } from '@/lib/contact'
import { SUPPORT_WHATSAPP_URL } from '@/shared/constants'
import {
  annualSavings,
  planForCourts,
  UNIFORM_PRICING,
  type BillingCycle,
  type PlanCard,
} from './plans-data'
import './precios.css'

/** Accesos rápidos; el campo permite cualquier cantidad exacta. */
const COURT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const

// El badge es un `span`: el componente `Badge` renderiza un `div`, y ni la tarjeta de Completo
// (TG-HP-006) ni un botón admiten un `div` adentro.
const GLASS_TAG = badgeVariants({ variant: 'glass' })

const CYCLE_OPTIONS = [
  { value: 'monthly', label: 'Mensual' },
  {
    value: 'annual',
    // Un solo hijo: el control de vidrio pone cada opción en una grilla.
    label: (
      <span className="inline-flex items-center gap-2">
        Anual
        <span className={GLASS_TAG}>−10%</span>
      </span>
    ),
  },
] as const

/**
 * Selector de cantidad exacta de canchas y ciclo de facturación, con los dos
 * planes lado a lado: Completo (destacado, el que se vende) y Completo + WhatsApp
 * (el ancla). Los montos no
 * cambian: Completo es el precio por cancha y WhatsApp suma el Plus de lista.
 */
export default function PlanSelector({ pricing = UNIFORM_PRICING }: { pricing?: PricingParams }) {
  return pricing.byCourtCount ? (
    <CourtCountOffer pricing={pricing} />
  ) : (
    <LegacyPlanSelector pricing={pricing} />
  )
}

function CourtCountOffer({ pricing }: { pricing: PricingParams }) {
  const [courts, setCourts] = useState(1)
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const annual = cycle === 'annual'
  const quote = courts > MAX_CATALOG_COURTS
  const amount = quote
    ? null
    : annual
      ? annualMonthlyEquivalent(courts, pricing) * 12
      : monthlyListAmount(courts, pricing)
  const offer = quote ? '8 canchas o más' : courts === 1 ? '1 cancha' : `${courts} canchas`
  const price = amount === null ? null : `${formatArs(amount)} por ${annual ? 'año' : 'mes'}`
  const message = price
    ? `Hola, tengo ${offer} de fútbol y vi TurnoGol a ${price}. ¿Me mostrás cómo funciona?`
    : 'Hola, quiero cotizar TurnoGol para un complejo de 8 canchas o más.'
  return (
    <div className="pr-plan glass-painted mx-auto max-w-xl">
      <div className="pr-controls">
        <span id="court-count-offer" className="text-center font-semibold">
          ¿Cuántos partidos podés jugar a la vez?
        </span>
        <div
          role="group"
          aria-labelledby="court-count-offer"
          className="flex flex-wrap justify-center gap-2"
        >
          {COURT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={n === courts}
              onClick={() => setCourts(n)}
              className={buttonVariants({ variant: 'pill-chip', size: 'pill-icon' })}
            >
              {n === MAX_CATALOG_COURTS + 1 ? '8+' : n}
            </button>
          ))}
        </div>
        {!quote && (
          <SegmentedControl
            variant="glass"
            aria-label="Ciclo de facturación"
            value={cycle}
            onValueChange={setCycle}
            options={[
              { value: 'monthly', label: 'Mensual' },
              { value: 'annual', label: `Anual −${pricing.annualDiscountBps / 100}%` },
            ]}
          />
        )}
        <div aria-live="polite" className="text-center">
          <p className="pr-small">{offer}</p>
          <p className="font-display text-3xl font-bold">{price ?? 'Cotización por WhatsApp'}</p>
          {!quote && annual && <p className="pr-small">Un pago por los 12 meses.</p>}
        </div>
        <a
          href={contactWhatsappUrl(message)}
          className={buttonVariants({ variant: 'pill', size: 'pill' })}
        >
          {quote ? 'Pedir cotización' : 'Hablar por WhatsApp'}
        </a>
      </div>
    </div>
  )
}

function LegacyPlanSelector({ pricing }: { pricing: PricingParams }) {
  const [courts, setCourts] = useState(3)
  const [courtInput, setCourtInput] = useState('3')
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const active = planForCourts(courts, pricing)

  return (
    <div>
      {/* Controles */}
      <div className="pr-controls">
        <span id="courts-label" className="text-[15px] font-semibold text-portal-slot-ink">
          ¿Cuántas canchas tenés?
        </span>
        <div
          role="radiogroup"
          aria-labelledby="courts-label"
          className="flex flex-wrap justify-center gap-2"
        >
          {COURT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={courts === n}
              onClick={() => {
                setCourts(n)
                setCourtInput(String(n))
              }}
              className={cn(
                buttonVariants({ variant: 'pill-chip', size: 'pill-icon' }),
                'text-base tabular-nums',
              )}
            >
              {n}
            </button>
          ))}
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
          className={cn(GLASS_INPUT, 'h-11 w-32 rounded-full text-center md:h-11')}
        />

        <SegmentedControl
          variant="glass"
          aria-label="Ciclo de facturación"
          className="w-[min(100%,340px)]"
          value={cycle}
          onValueChange={setCycle}
          options={CYCLE_OPTIONS}
        />

        {/* Anuncio del plan resultante (refuerzo + screen readers) */}
        <p aria-live="polite" className="text-center text-[15px] text-portal-muted">
          Precios para {courts} {courts === 1 ? 'cancha' : 'canchas'}.
        </p>
      </div>

      {/* Cards: Completo primero (es el que se vende). */}
      <div className="pr-plans">
        <PlanCardView plan={active} cycle={cycle} />
        <WhatsappCardView plan={active} courts={courts} cycle={cycle} />
      </div>

      <div className="mt-8 flex justify-center">
        <p className="glass-painted inline-flex max-w-[680px] items-center gap-3 rounded-3xl px-5 py-4 text-[15px] leading-snug text-portal-muted">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-portal-green" aria-hidden />
          <span>
            <span className="font-semibold text-portal-ink">
              Probalo 30 días gratis, sin tarjeta.
            </span>{' '}
            Después elegís Completo según tus canchas, con todo lo que ya cargaste.
          </span>
        </p>
      </div>
    </div>
  )
}

function FeatureList({ items }: { items: readonly string[] }) {
  return (
    <ul className="bz-ticks">
      {items.map((item) => (
        <li key={item}>
          <Check aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  )
}

const FULL_FEATURES = [
  'Anotás quién pagó y ves lo que falta cobrar',
  'Cargás el fijo una vez y aparece solo en tu grilla todas las semanas',
  'Caja de la noche, cantina y jugadores',
  'Tu encargado entra con su usuario',
  'Estadísticas y soporte por WhatsApp',
] as const

const CTA_FULL = 'w-full whitespace-nowrap'

/** Precio grande: el nodo se vuelve a montar con cada monto (`key`) y entra por reemplazo. */
function Price({ value }: { value: string }) {
  return (
    <div className="pr-plan__p">
      <span key={value} className="pr-swap">
        {value}
      </span>
      <small>/mes</small>
    </div>
  )
}

function WhatsappCardView({
  plan,
  courts,
  cycle,
  className,
}: {
  plan: PlanCard
  courts: number
  cycle: BillingCycle
  className?: string
}) {
  const plus = PLUS_LIST_PER_COURT_CENTS * courts
  const monthly = cycle === 'monthly'
  const glow = usePointerGlow<HTMLDivElement>()
  return (
    <div ref={glow} className={cn('pr-plan glass-painted glow-follow', className)}>
      <div className="pr-plan__n">
        <h2>Completo + WhatsApp</h2>
      </div>
      <div className="grid gap-2">
        {monthly ? (
          <Price value={formatArs(plan.priceMonthly + plus)} />
        ) : (
          <div key={plus} className="pr-swap text-xl font-bold">
            Completo + {formatArs(plus)}/mes
          </div>
        )}
        <div className="pr-small">{formatArs(PLUS_LIST_PER_COURT_CENTS)} más por cancha</div>
      </div>
      <FeatureList
        items={[
          'Todo lo de Completo',
          'Un asistente atiende tu WhatsApp y toma reservas a cualquier hora',
          'Responde con tus horarios y precios reales',
        ]}
      />
      <div className="grid gap-3">
        <a
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'pill-glass', size: 'pill' }), CTA_FULL)}
        >
          Escribinos
        </a>
        <p className="pr-note">Lo sumás cuando quieras</p>
      </div>
    </div>
  )
}

function PlanCardView({
  plan,
  cycle,
  className,
}: {
  plan: PlanCard
  cycle: BillingCycle
  className?: string
}) {
  const annual = cycle === 'annual'
  const price = annual ? plan.priceAnnual : plan.priceMonthly
  const glow = usePointerGlow<HTMLDivElement>()

  // La tarjeta es un `div` y la insignia cuelga directo de ella (no de un `div` interno): TG-HP-006
  // ubica esta tarjeta con `div` + "Recomendado" y tomaría el `div` más interno.
  return (
    <div ref={glow} className={cn('pr-plan pr-plan--top glass-painted glow-follow', className)}>
      <div className="pr-plan__n">
        <h2>Completo</h2>
      </div>
      <span className={cn(GLASS_TAG, 'absolute top-6 right-6')}>Recomendado</span>
      <div className="pr-small -mt-2">{plan.rangeLabel}</div>

      {annual ? (
        <div className="grid gap-2">
          <div className="pr-small">
            <s>{formatArs(plan.priceMonthly)}/mes</s>
          </div>
          <Price value={formatArs(price)} />
          <div className="pr-small">
            Total:{' '}
            <span className="font-semibold text-portal-ink">
              {formatArs(plan.priceAnnual * 12)}
            </span>{' '}
            /año (pago único)
          </div>
          <div className="text-[15px] font-semibold text-portal-slot-ink">
            Ahorrás {formatArs(annualSavings(plan))} al año
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <Price value={formatArs(price)} />
          <div className="pr-small">Facturación mensual</div>
        </div>
      )}

      <FeatureList items={FULL_FEATURES} />

      <div className="grid gap-3">
        <Link
          href="/register"
          className={cn(buttonVariants({ variant: 'pill', size: 'pill' }), CTA_FULL)}
        >
          Probar 30 días gratis
          <ArrowRight aria-hidden />
        </Link>
        <p className="pr-note">No te pedimos tarjeta · Lo dejás cuando quieras</p>
      </div>
    </div>
  )
}
