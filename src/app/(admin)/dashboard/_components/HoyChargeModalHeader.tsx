import { Clock } from 'lucide-react'
import { DialogTitle } from '@/components/ui/dialog'
import { MetaLine } from '@/components/ui/meta-line'
import { StatusBadge, type StatusBadgeVisual } from '@/components/ui/status-badge'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

/**
 * Título, hora y estado del turno en el modal de cobro de Hoy. Extraído de
 * `HoyChargeModal` — el badge explica por qué NO hay cobro (esperando seña,
 * ausente, hora de torneo); con cobro disponible, el renglón de arriba ya
 * alcanza.
 */
export function HoyChargeModalHeader({
  name,
  courtName,
  timeStart,
  timeEnd,
  when,
  late = false,
  showBadge,
  visual,
}: {
  name: string
  courtName: string
  timeStart: string
  timeEnd: string
  when: string | null
  /** Se jugó y no se cobró: "Terminó hace N min" va en rojo, con su reloj. */
  late?: boolean
  /** Se muestra solo sin cobro disponible (`!mode` en el caller). */
  showBadge: boolean
  visual: StatusBadgeVisual
}) {
  return (
    <div className="border-b border-border p-5 pr-24">
      <DialogTitle className="font-display text-lg leading-tight">{name}</DialogTitle>
      <MetaLine
        className="mt-1.5 text-xs tabular-nums text-muted-foreground"
        parts={[
          courtName,
          `${timeStart}–${timeEnd}`,
          when && (
            <span
              className={cn(
                late && cn('inline-flex items-center gap-1 font-medium', TONE_TEXT.destructive),
              )}
            >
              {late && <Clock aria-hidden className="h-3.5 w-3.5" />}
              {when}
            </span>
          ),
        ]}
      />
      {showBadge && (
        <div className="pt-2">
          <StatusBadge visual={visual} />
        </div>
      )}
    </div>
  )
}
