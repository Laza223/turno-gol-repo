'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, Check, CheckCircle2 } from 'lucide-react'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { badgeVariants } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { GLASS_INPUT } from '@/components/world/portal-auth-styles'
import { PLUS_LIST_PER_COURT_CENTS } from '@/modules/billing/pricing'
import { FREE_ONLINE_BOOKINGS_PER_MONTH, SUPPORT_WHATSAPP_URL } from '@/shared/constants'
import { annualSavings, planForCourts, type BillingCycle, type PlanCard } from './plans-data'
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

      {/* Cards: en el celular, Completo primero (es el que se vende). */}
      <div className="pr-plans">
        <FreeCardView className="order-2 lg:order-1" />
        <PlanCardView plan={active} cycle={cycle} className="order-1 lg:order-2" />
        <WhatsappCardView plan={active} courts={courts} cycle={cycle} className="order-3" />
      </div>

      <div className="mt-8 flex justify-center">
        <p className="glass-painted inline-flex max-w-[680px] items-center gap-3 rounded-3xl px-5 py-4 text-[15px] leading-snug text-portal-muted">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-portal-green" aria-hidden />
          <span>
            <span className="font-semibold text-portal-ink">
              Todos arrancan con 30 días de Completo.
            </span>{' '}
            Si después no pagás, seguís en Gratis y tus datos quedan guardados.
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

function FreeCardView({ className }: { className?: string }) {
  return (
    <div className={cn('pr-plan glass-painted', className)}>
      <div className="pr-plan__n">
        <h2>Gratis</h2>
      </div>
      <Price value={formatArs(0)} />
      <div className="pr-small">Para aparecer donde buscan cancha</div>
      <FeatureList items={FREE_FEATURES} />
      <div className="grid gap-3">
        <Link
          href="/register"
          className={cn(buttonVariants({ variant: 'pill-glass', size: 'pill' }), CTA_FULL)}
        >
          Empezar gratis
        </Link>
        <p className="pr-note">Las condiciones del gratis pueden cambiar con 30 días de aviso</p>
      </div>
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
  return (
    <div className={cn('pr-plan glass-painted', className)}>
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

  // La tarjeta es un `div` y la insignia cuelga directo de ella (no de un `div` interno): TG-HP-006
  // ubica esta tarjeta con `div` + "Recomendado" y tomaría el `div` más interno.
  return (
    <div className={cn('pr-plan pr-plan--top glass-painted', className)}>
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
          Empezar 30 días gratis
          <ArrowRight aria-hidden />
        </Link>
        <p className="pr-note">Sin tarjeta · Cancelás cuando quieras</p>
      </div>
    </div>
  )
}
