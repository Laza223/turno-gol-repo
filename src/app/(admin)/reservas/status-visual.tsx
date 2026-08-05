import type { LucideIcon } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'
import { bookingBadgeVisual, type SlotFacts } from '@/lib/booking/slot-visual'
import type { StatusTone } from '@/lib/status-tone'

export type ReservaStatusVisual = {
  icon: LucideIcon
  label: string
  tone: StatusTone
  /** Barra de acento (borde/tira lateral) — color sólido del token, MASTER §2.6. */
  accent: string
}

/**
 * Estado visual de una reserva/bloqueo: color + ícono + texto siempre juntos (§2.6).
 *
 * Desde Fase 3 el mapeo NO vive acá: la fuente única es
 * `@/lib/booking/slot-visual`, compartida con la grilla y su leyenda. Este
 * archivo queda como el adaptador de la vista de listado — mantiene la firma
 * que ya consumían `BookingListItem` y `BookingDetailCard`.
 *
 * A diferencia de la grilla, el listado no distingue "Señada" de "Confirmada":
 * el detalle de la seña ya vive en la línea secundaria de cada ítem. Esa
 * divergencia la resuelve `bookingBadgeVisual`, no este archivo.
 *
 * `pending`/`totalPaid` son opcionales: pasándolos, un turno jugado sin cobrar
 * se muestra como "Sin cobrar" (la alarma de plata de Fase 3) en vez de
 * confundirse con uno ya cobrado.
 */
export function reservaStatusVisual(booking: {
  status: string
  type: string
  depositStatus?: SlotFacts['depositStatus']
  pending?: number | null
  totalPaid?: number | null
}): ReservaStatusVisual {
  const visual = bookingBadgeVisual(booking)
  return {
    icon: visual.icon,
    label: visual.label,
    tone: visual.tone,
    accent: visual.accent,
  }
}

/** Badge de estado (§6.5): ícono + texto, nunca color solo. */
export function ReservaStatusBadge({
  visual,
  className,
}: {
  visual: ReservaStatusVisual
  className?: string
}) {
  return <StatusBadge visual={visual} className={className} />
}
