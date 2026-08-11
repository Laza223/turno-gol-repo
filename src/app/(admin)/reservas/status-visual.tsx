import type { LucideIcon } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'
import { UNPAID_ALARM_BADGE, bookingBadgeVisual, type SlotFacts } from '@/lib/booking/slot-visual'
import { TONE_ACCENT, type StatusTone } from '@/lib/status-tone'

export type ReservaStatusVisual = {
  icon: LucideIcon
  label: string
  tone: StatusTone
  /** Barra de acento (borde/tira lateral) — color sólido del token, MASTER §2.6. */
  accent: string
}

/**
 * La píldora "Sin cobrar" que acompaña —sin reemplazar— al badge de estado.
 * Es el MISMO `StatusBadge`, no un componente nuevo: hereda los tokens de tono
 * ya verificados en contraste.
 */
export const RESERVA_UNPAID_VISUAL: ReservaStatusVisual = {
  icon: UNPAID_ALARM_BADGE.icon,
  label: UNPAID_ALARM_BADGE.label,
  tone: UNPAID_ALARM_BADGE.tone,
  accent: TONE_ACCENT[UNPAID_ALARM_BADGE.tone],
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
 * `pending`/`totalPaid` son opcionales. Pasándolos, un turno terminado sin
 * cobrar devuelve `unpaid: true` — el badge SIGUE diciendo "Jugada"/"Ausente" y
 * el llamador pinta `RESERVA_UNPAID_VISUAL` al lado. Sin ellos, `unpaid` es
 * false y el comportamiento es el de siempre (fixtures y payloads viejos no
 * inventan una alarma que no pueden justificar).
 */
export function reservaStatusVisual(booking: {
  status: string
  type: string
  depositStatus?: SlotFacts['depositStatus']
  pending?: number | null
  totalPaid?: number | null
}): ReservaStatusVisual & { unpaid: boolean } {
  const visual = bookingBadgeVisual(booking)
  return {
    icon: visual.icon,
    label: visual.label,
    tone: visual.tone,
    accent: visual.accent,
    unpaid: visual.unpaid,
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
