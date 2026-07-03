import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface EmptyStateProps {
  icon?: LucideIcon
  illustration?: React.ReactNode  // decorative inline SVG; takes precedence over icon
  title: string
  description?: string
  action?: React.ReactNode  // typically <Link> or <Button>
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
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center',
        className,
      )}
    >
      {illustration ? (
        <div className="mb-4" aria-hidden="true">
          {illustration}
        </div>
      ) : Icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 ring-1 ring-inset ring-border">
          <Icon className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
