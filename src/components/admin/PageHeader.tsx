import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Icono opcional dentro de un halo emerald (lado izquierdo del título). */
  icon?: ReactNode
  /** Slot de acciones a la derecha (botones, toggles, filtros). */
  actions?: ReactNode
  className?: string
}

/**
 * Banda superior de página premium, theme-adaptive (`.page-header-band`):
 * light = gradiente slate + tinte emerald; dark = slate-950 + radial glow.
 * Reemplaza los `<h1 className="text-slate-900">` sueltos. Título en
 * `font-display`. Server Component (sin estado).
 */
export function PageHeader({ title, subtitle, icon, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'page-header-band relative overflow-hidden rounded-2xl border border-border/60 px-5 py-5 sm:px-7 sm:py-6',
        className,
      )}
    >
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {icon && (
            <span className="icon-halo inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-500/25">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
