'use client'

import { useEffect, useRef } from 'react'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { Check } from 'lucide-react'
import { formatLabel } from '@/components/public/courtFacets'
import { capitalizeFirst } from '@/lib/format'
import { cn } from '@/lib/utils'

const SHORT_DAY = new Intl.DateTimeFormat('es-AR', {
  weekday: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})
const LONG_DAY = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  timeZone: 'UTC',
})

const at = (date: string) => new Date(`${date}T12:00:00Z`)

/** "2026-10-15" → "jueves 15" (para frases: "No quedan horarios el jueves 15"). */
export const dayLong = (date: string) => LONG_DAY.format(at(date))

/** "2026-10-15" → "jue 15" (sin el punto que algunos ICU ponen a la abreviatura). */
const dayShort = (date: string) => SHORT_DAY.format(at(date)).replace('.', '')

type Option = { value: string; label: string; note?: string; disabled?: boolean }

const CHIP =
  'group inline-flex min-h-11 shrink-0 flex-col items-center justify-center whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:border-input focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:font-semibold data-[state=checked]:text-primary-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground'

/**
 * Grupo de opción única (RadioGroup de Radix: flechas, un solo tab stop). El relleno verde y el
 * tilde marcan lo elegido: nunca solo color. El `p-1 -m-1` deja lugar para el anillo de foco, que
 * el `overflow-x-auto` recortaría. Ojo: ese margen negativo le gana al `space-y-*` del padre, por
 * eso quien lo monta separa con `gap` (flex/grid) y no con `space-y`.
 *
 * `wrap`: desde `lg` los chips pasan a varias filas en vez de una fila que se desplaza; en el
 * celular siempre es una fila cortada en el borde, que avisa que hay más.
 */
function ChipGroup({
  label,
  options,
  value,
  onChange,
  wrap = false,
}: {
  label: string
  options: Option[]
  value: string
  onChange: (value: string) => void
  wrap?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Con 30 días de ventana el elegido puede quedar fuera de la fila: se la corre hasta que se
  // vea. Solo en horizontal; `scrollIntoView` movería también la página.
  useEffect(() => {
    const row = ref.current?.getBoundingClientRect()
    const chip = ref.current?.querySelector('[data-state=checked]')?.getBoundingClientRect()
    if (!ref.current || !row || !chip) return
    if (chip.left < row.left) ref.current.scrollLeft -= row.left - chip.left + 8
    else if (chip.right > row.right) ref.current.scrollLeft += chip.right - row.right + 8
  }, [value])

  return (
    <RadioGroup.Root
      ref={ref}
      aria-label={label}
      value={value}
      onValueChange={onChange}
      orientation="horizontal"
      className={cn(
        '-m-1 flex gap-2 overflow-x-auto p-1 [scrollbar-width:none]',
        wrap && 'lg:flex-wrap lg:overflow-visible',
      )}
    >
      {options.map((o) => (
        <RadioGroup.Item key={o.value} value={o.value} disabled={o.disabled} className={CHIP}>
          <span className="inline-flex items-center gap-1">
            <RadioGroup.Indicator>
              <Check className="size-4" aria-hidden />
            </RadioGroup.Indicator>
            {o.label}
          </span>
          {o.note && <span className="text-[13px] leading-4">{o.note}</span>}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}

/** Hoy y los días que el complejo deja reservar. Un día cerrado se ve, deshabilitado y dicho. */
export function DayChips({
  days,
  today,
  value,
  isClosed,
  onChange,
}: {
  days: string[]
  today: string
  value: string
  isClosed: (date: string) => boolean
  onChange: (date: string) => void
}) {
  const options = days.map((date) => ({
    value: date,
    label: date === today ? `Hoy ${dayShort(date)}` : capitalizeFirst(dayShort(date)),
    note: isClosed(date) ? 'Cerrado' : undefined,
    disabled: isClosed(date),
  }))
  // Con una semana (hasta 8 chips) cabe a la vista en escritorio; con más sigue siendo una fila.
  return (
    <ChipGroup
      label="Día"
      options={options}
      value={value}
      onChange={onChange}
      wrap={days.length <= 8}
    />
  )
}

/** "Todos" y un chip por formato, con palabras ("Fútbol 5"). Solo se muestra con más de un formato. */
export function FormatChips({
  formats,
  value,
  onChange,
}: {
  formats: number[]
  value: number | null
  onChange: (formato: number | null) => void
}) {
  const options = [
    { value: 'all', label: 'Todos' },
    ...formats.map((f) => ({ value: String(f), label: formatLabel(f) })),
  ]
  return (
    <ChipGroup
      label="Formato"
      options={options}
      value={value === null ? 'all' : String(value)}
      onChange={(v) => onChange(v === 'all' ? null : Number(v))}
    />
  )
}
