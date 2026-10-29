'use client'

import { Check } from 'lucide-react'
import type { HourRow } from '@/lib/booking/hour-summary'
import { TONE_TEXT, TONE_TINT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

const HELD_HELP_ID = 'hora-senando'

const STATE_LABEL = (row: HourRow) =>
  row.state === 'free'
    ? `${row.freeCount} libres`
    : { last: 'Queda 1', only: 'Libre', held: 'Señando', full: 'Completo' }[row.state]

const HOUR =
  'group flex min-h-16 flex-col items-center justify-center rounded-xl border border-input bg-card px-1 py-1 text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-pressed:border-primary! aria-pressed:bg-primary! aria-pressed:text-primary-foreground! disabled:cursor-not-allowed'

/**
 * El ámbar (el tono `warning` de `status-tone`) es solo de "Queda 1", la única escasez real.
 * "Señando" no es una alerta: es una espera, y se ve con borde punteado sobre el fondo de la
 * tarjeta; "Completo" va apagado. La hora elegida manda sobre todo (`!` en el HOUR de arriba):
 * los tintes `dark:` de `status-tone` le ganaban al relleno verde y dejaban texto oscuro sobre ámbar.
 */
const TONE: Record<HourRow['state'], string> = {
  free: '',
  last: cn(TONE_TINT.warning, 'border-warning/40'),
  only: '',
  held: 'border-dotted border-muted-foreground',
  full: 'border-border bg-muted hover:bg-muted',
}
const NOTE_TONE: Record<HourRow['state'], string> = {
  free: 'text-muted-foreground',
  last: cn('font-semibold', TONE_TEXT.warning),
  only: 'text-muted-foreground',
  held: 'font-semibold text-foreground',
  full: 'text-muted-foreground',
}

/**
 * Columnas según el ANCHO DEL CONTENEDOR, no el del viewport: la reserva es una columna de 24 rem
 * en escritorio y el ancho de la pantalla en el celular, así que un breakpoint de viewport
 * (`md:grid-cols-6`) metía 6 columnas en una columna angosta. 3 columnas hasta 640 px (botones de
 * 64 px con la hora en 18 px), 6 desde ahí. Lo comparte el esqueleto de la reserva.
 */
export const HOUR_COLUMNS = 'grid-cols-3 @[40rem]:grid-cols-6'

/**
 * Las horas del día. Cada una es un botón con `aria-pressed` (la elegida antes se ve con relleno y
 * tilde) y tocarla avanza de paso: por eso no es un RadioGroup, cuyas flechas elegirían, y
 * avanzarían, sin querer. Una hora sin lugar no se puede elegir pero se ve y se dice: "Completo"
 * tachada, o "Señando" con la ayuda visible debajo (no un `title`) porque puede liberarse
 * (decisión v2 D1).
 */
export default function HourGrid({
  rows,
  value,
  onChange,
}: {
  rows: HourRow[]
  value: string | null
  onChange: (time: string) => void
}) {
  return (
    <div className="@container">
      <div role="group" aria-label="Hora" className={cn('-m-1 grid gap-2 p-1', HOUR_COLUMNS)}>
        {rows.map((row) => (
          <button
            key={row.time}
            type="button"
            aria-pressed={row.time === value}
            disabled={row.freeCount === 0}
            aria-describedby={row.state === 'held' ? HELD_HELP_ID : undefined}
            onClick={() => onChange(row.time)}
            className={cn(HOUR, TONE[row.state])}
          >
            <span className="inline-flex items-center gap-1 text-lg font-semibold leading-6 tabular-nums">
              {row.time === value && <Check className="size-4" aria-hidden />}
              <span className={cn(row.state === 'full' && 'text-muted-foreground line-through')}>
                {row.time}
              </span>
            </span>
            <span
              className={cn(
                'text-sm leading-5 group-aria-pressed:font-semibold group-aria-pressed:text-primary-foreground!',
                NOTE_TONE[row.state],
              )}
            >
              {STATE_LABEL(row)}
            </span>
          </button>
        ))}
      </div>
      {rows.some((r) => r.state === 'held') && (
        <p id={HELD_HELP_ID} className="mt-2 text-[13px] leading-5 text-muted-foreground">
          Señando: alguien está pagando la seña. Si no la completa, el horario se libera.
        </p>
      )}
    </div>
  )
}
