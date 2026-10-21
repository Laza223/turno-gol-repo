'use client'

import * as RadioGroup from '@radix-ui/react-radio-group'
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
  'group flex min-h-[50px] flex-col items-center justify-center rounded-xl border border-input bg-card px-1 py-1 text-foreground transition-[color,background-color,border-color,box-shadow,translate] duration-150 motion-safe:enabled:not-data-[state=checked]:hover:-translate-y-0.5 enabled:not-data-[state=checked]:hover:border-emerald-400/60 enabled:not-data-[state=checked]:hover:shadow-md enabled:not-data-[state=checked]:hover:shadow-emerald-500/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=checked]:border-primary! data-[state=checked]:bg-primary! data-[state=checked]:text-primary-foreground! disabled:cursor-not-allowed'

/**
 * El ámbar (el tono `warning` de `status-tone`) es solo de "Queda 1", la única escasez real.
 * "Señando" no es una alerta: es una espera, y se ve con borde punteado sobre el fondo de la
 * tarjeta; "Completo" va apagado. La hora elegida manda sobre todo (`!` en el HOUR de arriba):
 * los tintes `dark:` de `status-tone` le ganaban al relleno verde y dejaban texto oscuro sobre ámbar.
 */
const TONE: Record<HourRow['state'], string> = {
  free: '',
  last: cn(
    TONE_TINT.warning,
    'border-warning/40 enabled:not-data-[state=checked]:hover:border-warning!',
  ),
  only: '',
  held: 'border-dotted border-muted-foreground enabled:not-data-[state=checked]:hover:border-muted-foreground!',
  full: 'disabled:border-border bg-muted',
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
 * (`md:grid-cols-6`) metía 6 columnas en una columna angosta. 3 columnas bajo 328 px (un celular
 * de 360 menos el margen), 4 desde ahí, 6 desde 640 px. Lo comparte el esqueleto de la reserva.
 */
export const HOUR_COLUMNS = 'grid-cols-3 @[20.5rem]:grid-cols-4 @[40rem]:grid-cols-6'

/**
 * Las horas del día como grupo de opción única (columnas: `HOUR_COLUMNS`).
 * Una hora sin lugar no se puede elegir pero se ve y se dice: "Completo" tachada, o "Señando" con
 * la ayuda visible debajo (no un `title`) porque puede liberarse (decisión v2 D1).
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
      <RadioGroup.Root
        aria-label="Hora"
        value={value ?? ''}
        onValueChange={onChange}
        className={cn('-m-1 grid gap-2 p-1', HOUR_COLUMNS)}
      >
        {rows.map((row) => (
          <RadioGroup.Item
            key={row.time}
            value={row.time}
            disabled={row.freeCount === 0}
            aria-describedby={row.state === 'held' ? HELD_HELP_ID : undefined}
            className={cn(HOUR, TONE[row.state])}
          >
            <span className="inline-flex items-center gap-1 text-base font-semibold leading-5 tabular-nums">
              <RadioGroup.Indicator>
                <Check className="size-4" aria-hidden />
              </RadioGroup.Indicator>
              <span className={cn(row.state === 'full' && 'text-muted-foreground line-through')}>
                {row.time}
              </span>
            </span>
            <span
              className={cn(
                'text-[13px] leading-4 group-data-[state=checked]:font-semibold group-data-[state=checked]:text-primary-foreground!',
                NOTE_TONE[row.state],
              )}
            >
              {STATE_LABEL(row)}
            </span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      {rows.some((r) => r.state === 'held') && (
        <p id={HELD_HELP_ID} className="mt-2 text-[13px] leading-5 text-muted-foreground">
          Señando: alguien está pagando la seña. Si no la completa, el horario se libera.
        </p>
      )}
    </div>
  )
}
