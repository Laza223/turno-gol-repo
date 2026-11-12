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
 * Una pantalla: "¿Qué canchas tenés?" con un contador por formato. Fútbol 5 arranca
 * en 1 y los demás en 0, así que un complejo de una sola cancha toca "Siguiente".
 * Las canchas se crean recién en Precios, cuando ya están los horarios.
 */
export function StepCanchas({ initialCounts, action, onBack }: Props) {
  const [counts, setCounts] = useState<Record<string, number>>(
    initialCounts && Object.keys(initialCounts).length > 0 ? initialCounts : DEFAULT_COUNTS,
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const navigate = useWizardNavigation()

  const total = WIZARD_FORMATS.reduce((sum, f) => sum + (counts[String(f)] ?? 0), 0)

  // Lo que se está armando, en vivo: "2 de Fútbol 5, 1 de Fútbol 7".
  const summary = WIZARD_FORMATS.filter((f) => (counts[String(f)] ?? 0) > 0)
    .map((f) => `${counts[String(f)]} de Fútbol ${f}`)
    .join(', ')

  function set(format: number, value: number) {
    setError(null)
    setCounts((prev) => ({ ...prev, [String(format)]: value }))
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
      description="Elegí cuántas hay de cada tipo."
      onNext={submit}
      isPending={isPending}
      error={error}
      onBack={onBack}
      backHref={stepPath(1)}
    >
      <ul className="space-y-2.5">
        {WIZARD_FORMATS.map((format) => {
          const count = counts[String(format)] ?? 0
          return (
            <li
              key={format}
              className={cn(
                'relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border py-2.5 pl-4 pr-2.5 transition-colors',
                count > 0 ? 'signup-lit' : 'border-white/10 bg-white/3',
              )}
            >
              <PitchLines
                className={cn(
                  'pointer-events-none absolute inset-y-0 left-0 h-full w-40',
                  count > 0 ? 'text-emerald-300/25' : 'text-white/8',
                )}
              />
              <span className="relative font-display text-lg font-black italic text-white">
                Fútbol {format}
              </span>
              <QuantityStepper
                className="relative"
                label={`canchas de Fútbol ${format}`}
                value={count}
                onChange={(v) => set(format, v)}
                min={0}
                max={MAX_WIZARD_COURTS}
              />
            </li>
          )
        })}
      </ul>

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
