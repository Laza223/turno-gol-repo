import { Ban, CheckCheck, Clock, HandCoins, HelpCircle, UserX, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ReservaStatusVisual = {
  icon: LucideIcon
  label: string
  /** Barra de acento (borde/tira lateral) — color sólido del token, MASTER §2.6. */
  accent: string
  /** Pill de badge dual-theme, receta §6.5: tinte 10%/15% + texto AA + ring. */
  badge: string
}

/**
 * Vocabulario canónico §8.5 + paleta §2.6. A diferencia de la grilla
 * (BookingCard.slotVisual), acá no se distingue "Señada" de "Confirmada":
 * el detalle de seña ya vive en la línea secundaria de cada ítem.
 */
/**
 * Recipe neutral (cancelada/expirada/bloqueo): mismo patrón que las demás
 * entradas (tinte 10%/15% + texto oscuro fijo + ring), NO `bg-muted
 * text-muted-foreground` — esa combo es opaca y da 4.21:1 (falla AA, ver
 * abonados/status-visual.tsx `canceled` con el mismo bug).
 */
const NEUTRAL_BADGE =
  'bg-slate-500/10 text-slate-800 ring-1 ring-inset ring-slate-500/25 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/40'

const STATUS_VISUALS: Record<string, ReservaStatusVisual> = {
  pending_payment: {
    icon: Clock,
    label: 'Esperando seña',
    accent: 'bg-warning',
    badge:
      'bg-warning/10 text-amber-800 ring-1 ring-inset ring-warning/25 dark:bg-warning/15 dark:text-amber-300 dark:ring-warning/40',
  },
  confirmed: {
    icon: HandCoins,
    label: 'Confirmada',
    accent: 'bg-info',
    badge:
      'bg-info/10 text-blue-800 ring-1 ring-inset ring-info/25 dark:bg-info/15 dark:text-blue-300 dark:ring-info/40',
  },
  completed: {
    icon: CheckCheck,
    label: 'Jugada',
    accent: 'bg-success',
    badge:
      'bg-success/10 text-emerald-800 ring-1 ring-inset ring-success/25 dark:bg-success/15 dark:text-emerald-300 dark:ring-success/40',
  },
  no_show: {
    icon: UserX,
    label: 'Ausente',
    accent: 'bg-destructive',
    badge:
      'bg-destructive/10 text-red-700 ring-1 ring-inset ring-destructive/25 dark:bg-destructive/15 dark:text-red-300 dark:ring-destructive/40',
  },
  canceled_refunded: {
    icon: XCircle,
    label: 'Cancelada',
    accent: 'bg-muted-foreground',
    badge: NEUTRAL_BADGE,
  },
  canceled_no_refund: {
    icon: XCircle,
    label: 'Cancelada',
    accent: 'bg-muted-foreground',
    badge: NEUTRAL_BADGE,
  },
  expired: {
    icon: XCircle,
    label: 'Expirada',
    accent: 'bg-muted-foreground',
    badge: NEUTRAL_BADGE,
  },
}

const BLOCK_VISUAL: ReservaStatusVisual = {
  icon: Ban,
  label: 'Bloqueo',
  accent: 'bg-muted-foreground',
  badge: NEUTRAL_BADGE,
}

/**
 * Un status sin entrada en el mapa NUNCA debe leerse como "Jugada" (§6.2 —
 * fricción proporcional al daño no aplica si el color miente sobre el cobro).
 * Neutro explícito: mismo patrón que BLOCK_VISUAL, distinto ícono.
 */
const FALLBACK_VISUAL: ReservaStatusVisual = {
  icon: HelpCircle,
  label: 'Estado desconocido',
  accent: 'bg-muted-foreground',
  badge: NEUTRAL_BADGE,
}

/** Estado visual de una reserva/bloqueo: color + ícono + texto siempre juntos (§2.6). */
export function reservaStatusVisual(booking: { status: string; type: string }): ReservaStatusVisual {
  if (booking.type === 'block') return BLOCK_VISUAL
  return STATUS_VISUALS[booking.status] ?? FALLBACK_VISUAL
}

/** Badge de estado (§6.5): ícono + texto, nunca color solo. */
export function ReservaStatusBadge({
  visual,
  className,
}: {
  visual: ReservaStatusVisual
  className?: string
}) {
  const Icon = visual.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        visual.badge,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {visual.label}
    </span>
  )
}
