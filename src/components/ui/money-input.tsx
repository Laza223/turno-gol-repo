'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  centsToInputDisplay,
  centsToWordsEsAr,
  MONEY_WORDS_THRESHOLD_CENTS,
  parsePesosToCents,
  splitPesosInput,
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
    const raw = e.target.value
    // El navegador ya aplicó la tecla/paste al DOM antes de disparar `change`:
    // `selectionStart` es dónde quedó el caret DESPUÉS de esa edición. Si
    // coincide con el final del string, el usuario estaba tipeando al final
    // (el caso común); si no, estaba corrigiendo un dígito en el medio.
    const caretWasAtEnd = e.target.selectionStart == null || e.target.selectionStart >= raw.length

    // `splitPesosInput` no puede distinguir, mirando solo el string final, un
    // punto/coma recién tipeado (decimal genuino, ej. teclado numérico que
    // emite "." o pegar "18500.75" desde una calculadora) de un separador de
    // miles que YA estaba ahí y quedó con menos dígitos detrás por un
    // Backspace/edición ("24.000" + Backspace → "24.00", el mismo string que
    // si alguien tipeara literalmente "24,00"). Solo confiamos la detección de
    // decimal cuando el string nuevo es el anterior con caracteres agregados
    // AL FINAL (tipeo hacia adelante o pegado sobre un campo vacío), o cuando
    // es un reemplazo TOTAL del campo (ver `isFreshReplacement` abajo): ahí
    // cualquier separador nuevo es intención fresca del usuario, nunca un
    // resto de nuestro propio formateo. Fuera de esos casos (Backspace,
    // editar un dígito en el medio) sacamos los separadores antes de parsear
    // para no reinterpretar un remanente de agrupación como decimal (bug real
    // 2026-09-15: "quería poner 20.000 y solo me dejaba cobrar los 84" —
    // editar "84.000" con Backspace lo leía como $84).
    const isAppend = raw.length > display.length && raw.startsWith(display)
    // Reemplazo total (seleccionar todo + pegar/tipear) sobre un campo YA
    // precargado (desde el PR #322 el campo ya no arranca vacío): ni continúa
    // el display anterior (isAppend) ni es un Backspace acortándolo por el
    // final (isTruncation) — y el caret quedó al final del string nuevo, la
    // firma de "esto entró todo junto" y no de estar corrigiendo un dígito en
    // el medio de lo que ya había. Ahí el separador también es decimal
    // genuino: pegar "50,75" sobre "8.400" precargado tiene que dar $50, no
    // $5.075 (auditoría 2026-09-16 hallazgo 5 — sin esto caía en la rama de
    // abajo, que borra el separador y lee "5075").
    const isTruncation = raw.length < display.length && display.startsWith(raw)
    const isFreshReplacement = caretWasAtEnd && !isAppend && !isTruncation
    const parseableRaw = isAppend || isFreshReplacement ? raw : raw.replace(/[.,]/g, '')

    const parsed = parsePesosToCents(parseableRaw)
    // La cola decimal se conserva en el display aunque no valga: si se borrara
    // acá, la coma desaparecería en la misma tecla y los dígitos de los
    // centavos se pegarían al entero en la siguiente ("1.500" + "5" = "15.005"
    // camino a $150.050 — 🔴 QA 2026-08-28 F-01). Dejarla a la vista hace
    // evidente que el campo es de pesos enteros mientras se tipea.
    const { decimals } = splitPesosInput(parseableRaw)
    const nextDisplay =
      parsed == null ? '' : centsToInputDisplay(parsed) + (decimals == null ? '' : `,${decimals}`)
    setDisplay(nextDisplay)
    if (!isControlled) setInternalCents(parsed)
    onValueChange?.(parsed)

    // El usuario tipea de izquierda a derecha; sin esto, insertar el separador
    // de miles manda el caret al principio del campo en cada tecla. Pero
    // forzarlo SIEMPRE al final es lo que hacía imposible corregir un dígito
    // en el medio de un monto ya agrupado (solo se podía editar por el final,
    // justo el único lugar donde el bug de `splitPesosInput` podía morder) —
    // por eso solo se fuerza cuando el propio tipeo ya estaba en el final.
    if (caretWasAtEnd) {
      requestAnimationFrame(() => {
        const el = innerRef.current
        if (el) el.setSelectionRange(nextDisplay.length, nextDisplay.length)
      })
    }
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
