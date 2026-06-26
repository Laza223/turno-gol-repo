import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Patrón de tabla premium compartido (reservas, caja, jugadores, staff,
 * reportes, super-admin). Theme-adaptive: contenedor glass/elevado, header
 * sticky con blur, hairlines `divide-border`, hover de fila, numéricos
 * `tabular-nums text-right`. Exporta tanto un contenedor ergonómico como
 * constantes de clase para tablas con markup propio (sortable, etc.).
 */

export const tablePremium = {
  /** Contenedor exterior con la superficie glass/elevada. */
  shell:
    'overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(2,6,23,0.04),0_8px_24px_-12px_rgba(2,6,23,0.10)] dark:bg-white/[.02] dark:backdrop-blur-sm dark:shadow-[0_24px_50px_-34px_rgba(0,0,0,0.9)]',
  /** Fila de header sticky con blur. */
  headRow:
    'sticky top-0 z-10 bg-muted/70 backdrop-blur-md text-xs font-semibold uppercase tracking-wider text-muted-foreground',
  th: 'px-4 py-3 text-left font-semibold',
  thNum: 'px-4 py-3 text-right font-semibold',
  row: 'border-t border-border transition-colors hover:bg-accent/60',
  td: 'px-4 py-3 text-sm text-foreground',
  tdMuted: 'px-4 py-3 text-sm text-muted-foreground',
  tdNum: 'px-4 py-3 text-right text-sm tabular-nums text-foreground',
} as const

interface PremiumTableProps {
  children: ReactNode
  className?: string
}

/** Envuelve una `<table>` en la superficie premium con scroll horizontal. */
export function PremiumTable({ children, className }: PremiumTableProps) {
  return (
    <div className={cn(tablePremium.shell, className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}
