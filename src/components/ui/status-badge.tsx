import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TONE_BADGE, type StatusTone } from '@/lib/status-tone'

export type StatusBadgeVisual = {
  icon: LucideIcon
  label: string
  tone: StatusTone
}

/**
 * Badge de estado (MASTER §6.5): color + ícono + texto SIEMPRE juntos, nunca
 * color solo (§1.4 — daltonismo).
 *
 * Este componente reemplaza cuatro copias idénticas que vivían en
 * `reservas/`, `canchas/`, `abonados/` y `staff/`. Las clases del pill salen de
 * `TONE_BADGE`, así que un arreglo de contraste se aplica en un solo lugar.
 */
export function StatusBadge({
  visual,
  className,
}: {
  visual: StatusBadgeVisual
  className?: string
}) {
  const Icon = visual.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        TONE_BADGE[visual.tone],
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {visual.label}
    </span>
  )
}
