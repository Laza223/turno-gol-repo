import { CheckCircle2, PauseCircle, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AbonadoStatus } from '@/modules/abonados/abonado.types'

export type AbonadoStatusVisual = {
  icon: LucideIcon
  label: string
  /** Pill de badge dual-theme, receta §6.5: tinte 10%/15% + texto AA + ring. */
  badge: string
}

const STATUS_VISUALS: Record<AbonadoStatus, AbonadoStatusVisual> = {
  active: {
    icon: CheckCircle2,
    label: 'Activo',
    badge:
      'bg-success/10 text-emerald-800 ring-1 ring-inset ring-success/25 dark:bg-success/15 dark:text-emerald-300 dark:ring-success/40',
  },
  paused: {
    icon: PauseCircle,
    label: 'Pausado',
    badge:
      'bg-warning/10 text-amber-800 ring-1 ring-inset ring-warning/25 dark:bg-warning/15 dark:text-amber-300 dark:ring-warning/40',
  },
  canceled: {
    icon: XCircle,
    label: 'Cancelado',
    badge: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
  },
}

/** Estado visual del abonado: color + ícono + texto siempre juntos (MASTER §2.6). */
function abonadoStatusVisual(status: AbonadoStatus): AbonadoStatusVisual {
  return STATUS_VISUALS[status]
}

/** Badge de estado (§6.5): ícono + texto, nunca color solo. */
export function AbonadoStatusBadge({
  status,
  className,
}: {
  status: AbonadoStatus
  className?: string
}) {
  const visual = abonadoStatusVisual(status)
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
