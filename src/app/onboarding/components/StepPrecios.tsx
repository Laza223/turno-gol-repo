'use client'

import { useState, useTransition } from 'react'
import { ChoiceCards } from '@/components/ui/choice-cards'
import { SelectMenu } from '@/components/ui/select-menu'
import { DEFAULT_CUT_HOUR, type WizardPricesInput } from '@/modules/onboarding/onboarding.schema'
import { stepPath } from '@/modules/onboarding/onboarding.steps'
import type { WizardActionResult } from '../actions'
import { useWizardNavigation } from './use-wizard-navigation'
import { PriceInput } from './PriceInput'
import { StepScreen } from './StepScreen'

type FormatRow = { format: number; count: number }
type PriceDraft = { dayPrice: number; nightPrice?: number }

type Props = {
  /** Un precio por pantalla, en este orden (formatos de menor a mayor). */
  formats: readonly FormatRow[]
  /** Precios ya cargados (revisita), por formato. */
  initialPrices?: Record<string, PriceDraft>
  initialCutHour?: number
  action: (input: WizardPricesInput) => Promise<WizardActionResult>
  /** "Atrás" desde la primera pantalla. Sin esto vuelve al paso anterior del wizard por ruta. */
  onBack?: () => void
}

type Row = { dayPrice: number | null; different: boolean; nightPrice: number | null }

/** Corte "desde las": de las 12 a las 23. */
const CUT_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const hour = 12 + i
  return { value: String(hour), label: `${String(hour).padStart(2, '0')}:00` }
})

const NIGHT_OPTIONS = [
  { value: 'no', label: 'No, es el mismo precio' },
  { value: 'yes', label: 'Sí, de noche cobro distinto' },
] as const

/**
 * Una pantalla por formato elegido: "¿Cuánto cobrás el turno de Fútbol 5?" con
 * eco en vivo, y debajo "¿A la noche cobrás distinto?". El turno es de 60 minutos
 * fijo, así que no se pregunta la duración. Con un solo formato el título no
 * nombra el formato. Al terminar la última pantalla se crean las canchas.
 */
export function StepPrecios({ formats, initialPrices, initialCutHour, action, onBack }: Props) {
  const [index, setIndex] = useState(0)
  const [rows, setRows] = useState<Row[]>(() =>
    formats.map((f) => {
      const saved = initialPrices?.[String(f.format)]
      return {
        dayPrice: saved?.dayPrice ?? null,
        different: saved?.nightPrice !== undefined,
        nightPrice: saved?.nightPrice ?? null,
      }
    }),
  )
  const [cutHour, setCutHour] = useState(initialCutHour ?? DEFAULT_CUT_HOUR)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const navigate = useWizardNavigation()

  const current = formats[index]
  const row = rows[index]
  if (!current || !row) return null
  const isLast = index === formats.length - 1
  const multiple = formats.length > 1

  function patch(next: Partial<Row>) {
    setError(null)
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...next } : r)))
  }

  function validateCurrent(): string | null {
    if (!row || row.dayPrice === null || row.dayPrice <= 0) return 'Cargá cuánto cobrás el turno.'
    if (row.different && (row.nightPrice === null || row.nightPrice <= 0)) {
      return 'Cargá cuánto cobrás el turno de noche.'
    }
    return null
  }

  function submit() {
    const problem = validateCurrent()
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    if (!isLast) {
      setIndex(index + 1)
      return
    }
    const payload: WizardPricesInput = {
      formats: formats.map((f, i) => {
        const r = rows[i]!
        return {
          format: f.format,
          count: f.count,
          dayPrice: r.dayPrice!,
          ...(r.different && r.nightPrice !== null ? { nightPrice: r.nightPrice } : {}),
        }
      }),
      ...(rows.some((r) => r.different) ? { cutHour } : {}),
    }
    startTransition(async () => {
      const result = await action(payload)
      if (!result.success) {
        startTransition(() => setError(result.error))
        return
      }
      navigate(result)
    })
  }

  return (
    <StepScreen
      title={
        multiple
          ? `¿Cuánto cobrás el turno de Fútbol ${current.format}?`
          : '¿Cuánto cobrás el turno?'
      }
      accent="turno"
      description={
        multiple
          ? `Es el precio de tus ${current.count} ${current.count === 1 ? 'cancha' : 'canchas'} de Fútbol ${current.format}.`
          : undefined
      }
      onNext={submit}
      isPending={isPending}
      error={error}
      onBack={index > 0 ? () => setIndex(index - 1) : onBack}
      backHref={index === 0 ? stepPath(3) : undefined}
      focusHeading={index > 0}
    >
      <div className="space-y-8">
        <PriceInput
          key={`price-${current.format}`}
          id={`precio-${current.format}`}
          label={`Precio del turno de Fútbol ${current.format}`}
          valueCents={row.dayPrice}
          onChange={(cents) => patch({ dayPrice: cents })}
          autoFocus={index === 0}
        />

        <section aria-labelledby={`noche-${current.format}`} className="space-y-3">
          <h3 id={`noche-${current.format}`} className="text-base font-semibold text-foreground">
            ¿A la noche cobrás distinto?
          </h3>
          <ChoiceCards
            aria-label="¿A la noche cobrás distinto?"
            options={NIGHT_OPTIONS}
            value={row.different ? 'yes' : 'no'}
            onChange={(v) => patch({ different: v === 'yes' })}
          />
          {row.different && (
            <div className="space-y-4 pt-1">
              <div>
                <p className="mb-1.5 text-sm font-medium text-foreground">Precio de noche</p>
                <PriceInput
                  key={`night-${current.format}`}
                  id={`precio-noche-${current.format}`}
                  label={`Precio de noche del turno de Fútbol ${current.format}`}
                  valueCents={row.nightPrice}
                  onChange={(cents) => patch({ nightPrice: cents })}
                />
              </div>
              <div>
                <label
                  htmlFor={`corte-${current.format}`}
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Desde las
                </label>
                <SelectMenu
                  id={`corte-${current.format}`}
                  value={String(cutHour)}
                  onChange={(v) => setCutHour(Number(v))}
                  options={CUT_OPTIONS}
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </StepScreen>
  )
}
