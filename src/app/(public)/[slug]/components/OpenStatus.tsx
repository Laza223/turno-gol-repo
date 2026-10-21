'use client'

import { useArtNow } from '@/hooks/use-art-now'
import { describeOpenStatus, type ScheduleSource } from '@/lib/schedule/open-status'
import { cn } from '@/lib/utils'

/**
 * "Abierto · hasta la 01:00" / "Cerrado · abre a las 18:00" / "Cerrado hoy" / "Cerró por hoy ·
 * abre mañana a las 09:00". Es una isla de cliente porque la página es ISR: el servidor no conoce
 * el reloj del visitante. Hasta hidratar (`useArtNow` sin fecha) deja una línea vacía del mismo
 * alto —nada de texto "neutro" que después se cambia—, y el estado ocupa ese lugar. Estado y
 * horario van siempre en palabras: el color acompaña, nunca informa solo.
 *
 * Recibe solo el horario (`ScheduleSource`), no el complejo entero: lo que le llega por props
 * viaja serializado al cliente.
 */
export default function OpenStatus({ schedule }: { schedule: ScheduleSource }) {
  const now = useArtNow()
  const status = now.date ? describeOpenStatus(now, schedule) : null

  return (
    <p
      data-testid="open-status"
      className={cn(
        'min-h-5 text-sm',
        status &&
          'inline-flex items-center gap-2 before:size-2 before:shrink-0 before:rounded-full before:bg-current before:content-[""]',
        status?.open
          ? 'font-semibold text-emerald-800 dark:text-emerald-400'
          : 'text-muted-foreground',
      )}
    >
      {status?.text}
    </p>
  )
}
