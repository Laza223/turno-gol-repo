import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface EmptyStateProps {
  icon?: LucideIcon
  illustration?: React.ReactNode // decorative inline SVG; takes precedence over icon
  title: string
  description?: string
  action?: React.ReactNode // typically <Link> or <Button>
  className?: string
}

export function EmptyState({
  icon: Icon,
  illustration,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'card-entrance relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border/70 bg-gradient-to-b from-card to-muted/30 px-6 py-14 text-center dark:from-card dark:to-muted/10',
        className,
      )}
    >
      {/* Decorative radial glow */}
      <span
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_50%_0%,_rgba(16,185,129,0.06),transparent)]"
        aria-hidden
      />

      {illustration ? (
        <div className="relative mb-5" aria-hidden="true">
          {illustration}
        </div>
      ) : Icon ? (
        <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/8 ring-1 ring-inset ring-emerald-500/15 dark:bg-emerald-500/10 dark:ring-emerald-500/20">
          <Icon
            className="h-7 w-7 text-emerald-600/60 dark:text-emerald-400/60"
            aria-hidden="true"
          />
        </div>
      ) : null}
      {/* Vive dentro de páginas con un <h1> de PageHeader y sin h2 intermedio
          (courts, abonados, staff, reservas, caja): h2 es el nivel correcto,
          no h3 (heading-order). Donde ya hay un h2 hermano (ej. caja/page.tsx
          "Movimientos del día"), repetir nivel es válido para axe. */}
      <h2 className="relative text-base font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="relative mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="relative mt-6">{action}</div> : null}
    </div>
  )
}
