'use client'

import { useState, useTransition } from 'react'
import PitchLines from '@/components/public/PitchLines'
import { QuantityStepper } from '@/components/ui/quantity-stepper'
import { cn } from '@/lib/utils'
import { MAX_WIZARD_COURTS, WIZARD_FORMATS } from '@/modules/onboarding/onboarding.schema'
import { stepPath } from '@/modules/onboarding/onboarding.steps'
import type { WizardActionResult } from '../actions'
import { useWizardNavigation } from './use-wizard-navigation'
import { StepScreen } from './StepScreen'

type Props = {
  /** Cantidad ya elegida por formato (`{ "5": 2 }`). Sin esto arranca con 1 de Fútbol 5. */
  initialCounts?: Record<string, number>
  action: (counts: Record<string, number>) => Promise<WizardActionResult>
  /** "Atrás" desde la primera pantalla. Sin esto vuelve al paso anterior del wizard por ruta. */
  onBack?: () => void
}

const DEFAULT_COUNTS: Record<string, number> = { '5': 1 }

/**
 * Una pantalla: "¿Qué canchas tenés?". Arriba, los 8 formatos (Fútbol 4 al 11) para
 * tocar; abajo, un contador por cada formato elegido. Fútbol 5 arranca elegido con 1,
 * así que un complejo de una sola cancha toca "Siguiente". Las canchas se crean recién
 * en Precios, cuando ya están los horarios.
 */
export function StepCanchas({ initialCounts, action, onBack }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>(
    initialCounts && Object.keys(initialCounts).length > 0 ? initialCounts : DEFAULT_COUNTS,
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const navigate = useWizardNavigation()

  const chosen = WIZARD_FORMATS.filter((f) => (counts[String(f)] ?? 0) > 0)
  const total = chosen.reduce((sum, f) => sum + (counts[String(f)] ?? 0), 0)

  // Lo que se está armando, en vivo: "2 de Fútbol 5, 1 de Fútbol 7".
  const summary = chosen.map((f) => `${counts[String(f)]} de Fútbol ${f}`).join(', ')

  function set(format: number, value: number) {
    setError(null)
    setCounts((prev) => ({ ...prev, [String(format)]: value }))
  }

  function toggle(format: number) {
    set(format, (counts[String(format)] ?? 0) > 0 ? 0 : 1)
  }

  function submit() {
    if (total < 1) {
      setError('Elegí al menos una cancha.')
      return
    }
    if (total > MAX_WIZARD_COURTS) {
      setError(`Máximo ${MAX_WIZARD_COURTS} canchas. Después podés cargar más desde Canchas.`)
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await action(counts)
      if (!result.success) {
        startTransition(() => setError(result.error))
        return
      }
      navigate(result)
    })
  }

  return (
    <StepScreen
      title="¿Qué canchas tenés?"
      accent="canchas"
      description="Tocá los tipos que tenés y elegí cuántas hay de cada uno."
      onNext={submit}
      isPending={isPending}
      error={error}
      onBack={onBack}
      backHref={stepPath(1)}
    >
      <ul aria-label="Formatos" className="grid grid-cols-4 gap-2">
        {WIZARD_FORMATS.map((format) => {
          const on = (counts[String(format)] ?? 0) > 0
          return (
            <li key={format}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(format)}
                className={cn(
                  'relative flex h-16 w-full flex-col items-center justify-center overflow-hidden rounded-xl border transition-[background-color,border-color,scale] duration-150 active:scale-[0.96] motion-reduce:active:scale-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400',
                  on ? 'signup-lit' : 'border-white/10 bg-white/3 hover:bg-white/6',
                )}
              >
                <span
                  className={cn(
                    'text-[11px] font-medium leading-none',
                    on ? 'text-emerald-200' : 'text-muted-foreground',
                  )}
                >
                  Fútbol
                </span>{' '}
                <span
                  className={cn(
                    'mt-1 font-display text-2xl font-black italic leading-none tabular-nums',
                    on ? 'text-white' : 'text-white/70',
                  )}
                >
                  {format}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {chosen.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {chosen.map((format) => (
            <li
              key={format}
              className="signup-pop relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/3 py-2 pl-4 pr-2"
            >
              <PitchLines className="pointer-events-none absolute inset-y-0 left-0 h-full w-40 text-emerald-300/15" />
              <span className="relative text-sm text-muted-foreground">
                Canchas de{' '}
                <span className="font-display text-lg font-black italic text-white">
                  Fútbol {format}
                </span>
              </span>
              <QuantityStepper
                className="relative"
                label={`canchas de Fútbol ${format}`}
                value={counts[String(format)] ?? 0}
                onChange={(v) => set(format, v)}
                min={1}
                max={MAX_WIZARD_COURTS}
              />
            </li>
          ))}
        </ul>
      )}

      <p aria-live="polite" className="mt-4 flex items-baseline gap-2 text-base text-foreground">
        <span className="font-display text-3xl font-black italic tabular-nums text-emerald-300">
          {total}
        </span>
        <span>
          <strong className="font-semibold">{total === 1 ? 'cancha' : 'canchas'}</strong>
          {summary && <span className="block text-sm text-muted-foreground">{summary}</span>}
        </span>
      </p>
    </StepScreen>
  )
}
