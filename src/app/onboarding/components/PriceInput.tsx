'use client'

import { MoneyInput } from '@/components/ui/money-input'
import { centsToInputDisplay } from '@/lib/money'

type Props = {
  id: string
  /** Qué se cobra, para el nombre accesible ("Precio del turno de Fútbol 5"). */
  label: string
  valueCents: number | null
  onChange: (cents: number | null) => void
  autoFocus?: boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/**
 * Precio de un turno de 60 minutos: el `MoneyInput` de la plataforma (pesos enteros,
 * teclado numérico, y el arreglo del Backspace sobre el separador de miles) más un
 * eco en vivo debajo. El eco reemplaza a la relectura en palabras del input, que acá
 * sería lo mismo dicho dos veces.
 */
export function PriceInput({ id, label, valueCents, onChange, autoFocus, ...aria }: Props) {
  const echoId = `${id}-echo`
  const describedBy = [aria['aria-describedby'], echoId].filter(Boolean).join(' ')
  return (
    <div className="space-y-2">
      <MoneyInput
        id={id}
        aria-label={label}
        valueCents={valueCents}
        onValueChange={onChange}
        showWords={false}
        autoFocus={autoFocus}
        aria-invalid={aria['aria-invalid']}
        aria-describedby={describedBy}
        maxCents={100_000_000}
        placeholder="60.000"
        className="h-16 bg-white/4 pl-9 font-display text-3xl font-black tabular-nums md:h-16 md:text-3xl"
      />
      <p id={echoId} className="min-h-5 text-sm text-emerald-300" aria-live="polite">
        {valueCents !== null && valueCents > 0
          ? `Un turno de 60 minutos: $${centsToInputDisplay(valueCents)}`
          : ''}
      </p>
    </div>
  )
}
