'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  centsToInputDisplay,
  centsToWordsEsAr,
  MONEY_WORDS_THRESHOLD_CENTS,
  parsePesosToCents,
} from '@/lib/money'

export interface MoneyInputProps {
  id?: string
  /** Si se pasa, además del input visible se renderiza un `<input type="hidden">`
   *  con el valor en CENTAVOS — para forms no controlados que leen FormData
   *  directo (patrón de BookingFormModal). En forms controlados, usar `onValueChange`. */
  name?: string
  /** Controlado: valor en centavos. `undefined` = no controlado. */
  valueCents?: number | null
  /** No controlado: valor inicial en centavos. */
  defaultValueCents?: number | null
  onValueChange?: (cents: number | null) => void
  placeholder?: string
  /** Límites en CENTAVOS. Se aplican al perder foco (no en cada tecla — clampear
   *  mientras se tipea trunca números que todavía se están completando). */
  minCents?: number
  maxCents?: number
  disabled?: boolean
  required?: boolean
  autoFocus?: boolean
  className?: string
  'aria-label'?: string
  'aria-describedby'?: string
  /** Relectura en palabras arriba de MONEY_WORDS_THRESHOLD_CENTS (visión v2 §6.3):
   *  hace imposible tipear $25 en vez de $25.000 sin notarlo. default true. */
  showWords?: boolean
}

/**
 * Control de plata único de la plataforma (visión v2 §6.3): pesos enteros,
 * separador de miles mientras se tipea, teclado numérico en mobile, monto
 * releído en palabras arriba del umbral. Reemplaza los `type="number"` /
 * `Number(x)` sueltos que hoy permiten $25 en vez de $25.000 (🔴 auditoría
 * 2026-08-01 §4.4).
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  {
    id,
    name,
    valueCents,
    defaultValueCents,
    onValueChange,
    placeholder = '0',
    minCents,
    maxCents,
    disabled,
    required,
    autoFocus,
    className,
    showWords = true,
    ...aria
  },
  forwardedRef,
) {
  const isControlled = valueCents !== undefined
  const [internalCents, setInternalCents] = React.useState<number | null>(
    isControlled ? (valueCents ?? null) : (defaultValueCents ?? null),
  )
  const cents = isControlled ? (valueCents ?? null) : internalCents
  const [display, setDisplay] = React.useState(() => centsToInputDisplay(cents))
  const innerRef = React.useRef<HTMLInputElement>(null)
  React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement)

  // Reformatea cuando el valor cambia desde AFUERA (ej. el padre resetea el
  // form). El propio tipeo nunca pasa por acá: handleChange ya escribe el
  // display final, así que este effect no le pisa el cursor al usuario.
  React.useEffect(() => {
    if (isControlled) setDisplay(centsToInputDisplay(valueCents ?? null))
  }, [isControlled, valueCents])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const parsed = parsePesosToCents(e.target.value)
    const nextDisplay = centsToInputDisplay(parsed)
    setDisplay(nextDisplay)
    if (!isControlled) setInternalCents(parsed)
    onValueChange?.(parsed)

    // El usuario tipea de izquierda a derecha; sin esto, insertar el separador
    // de miles manda el caret al principio del campo en cada tecla.
    requestAnimationFrame(() => {
      const el = innerRef.current
      if (el) el.setSelectionRange(nextDisplay.length, nextDisplay.length)
    })
  }

  function handleBlur() {
    if (cents == null || (minCents == null && maxCents == null)) return
    const clamped = Math.min(maxCents ?? Infinity, Math.max(minCents ?? -Infinity, cents))
    if (clamped === cents) return
    setDisplay(centsToInputDisplay(clamped))
    if (!isControlled) setInternalCents(clamped)
    onValueChange?.(clamped)
  }

  const words =
    showWords && cents != null && cents >= MONEY_WORDS_THRESHOLD_CENTS
      ? centsToWordsEsAr(cents)
      : null
  const wordsId = id ? `${id}-words` : undefined
  const describedBy = [aria['aria-describedby'], wordsId].filter(Boolean).join(' ') || undefined

  return (
    <div className="space-y-1">
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-muted-foreground md:text-sm"
          aria-hidden="true"
        >
          $
        </span>
        <input
          ref={innerRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={display}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          {...aria}
          aria-describedby={describedBy}
          className={cn(
            'flex h-11 w-full rounded-lg border border-border bg-card py-2 pl-7 pr-3.5 text-base tabular-nums text-foreground ring-offset-background transition-colors placeholder:text-muted-foreground/60 hover:border-border/80 focus-visible:border-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:h-10 md:text-sm',
            className,
          )}
        />
      </div>
      {name ? <input type="hidden" name={name} value={cents ?? ''} /> : null}
      {words ? (
        <p id={wordsId} className="text-xs text-muted-foreground">
          ${centsToInputDisplay(cents)} — {words} pesos
        </p>
      ) : null}
    </div>
  )
})
