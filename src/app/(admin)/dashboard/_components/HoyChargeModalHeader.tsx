import { DialogTitle } from '@/components/ui/dialog'
import { StatusBadge, type StatusBadgeVisual } from '@/components/ui/status-badge'

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
  showBadge,
  visual,
}: {
  name: string
  courtName: string
  timeStart: string
  timeEnd: string
  when: string | null
  /** Se muestra solo sin cobro disponible (`!mode` en el caller). */
  showBadge: boolean
  visual: StatusBadgeVisual
}) {
  return (
    <div className="border-b border-border p-5 pr-24">
      <DialogTitle className="font-display text-lg leading-tight">{name}</DialogTitle>
      <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
        {courtName} · {timeStart}–{timeEnd}
        {when ? ` · ${when}` : ''}
      </p>
      {showBadge && (
        <div className="pt-2">
          <StatusBadge visual={visual} />
        </div>
      )}
    </div>
  )
}
