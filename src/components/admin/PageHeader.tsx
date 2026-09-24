import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Icono opcional dentro de un halo emerald (lado izquierdo del título). */
  icon?: ReactNode
  /** Slot de acciones a la derecha (botones, toggles, filtros). */
  actions?: ReactNode
  /** Link "Volver" u otro elemento de navegación, arriba del título. */
  back?: ReactNode
  /**
   * `band` (default): banda `.page-header-band` con gradiente. `plain`: sin
   * banda ni padding propio, para páginas de detalle que ya viven dentro de
   * otro contenedor — conserva la tipografía del h1.
   */
  variant?: 'band' | 'plain'
  className?: string
}

/**
 * Encabezado de página. `variant="band"` (default) es la banda superior
 * premium, theme-adaptive (`.page-header-band`): light = gradiente slate +
 * tinte emerald; dark = slate-950 + radial glow. `variant="plain"` reutiliza
 * la misma tipografía del h1 sin la banda, para los detalles que hoy arman su
 * `<h1>` a mano. Título en `font-display`. Server Component (sin estado).
 */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  back,
  variant = 'band',
  className,
}: PageHeaderProps) {
  const heading = (
    <div className="min-w-0">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  )

  if (variant === 'plain') {
    return (
      <div className={cn('space-y-2', className)}>
        {back}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {icon && (
              <span className="icon-halo inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-500/25">
                {icon}
              </span>
            )}
            {heading}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'page-header-band relative overflow-hidden rounded-2xl border border-border/60 px-5 py-5 sm:px-7 sm:py-6',
        className,
      )}
    >
      {back && <div className="relative mb-2">{back}</div>}
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {icon && (
            <span className="icon-halo inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-500/25">
              {icon}
            </span>
          )}
          {heading}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
