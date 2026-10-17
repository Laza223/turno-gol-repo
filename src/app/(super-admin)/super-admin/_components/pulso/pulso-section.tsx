import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Tarjeta con título para las secciones del Pulso. */
export function PulsoSection({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-lg border border-border bg-card shadow-xs', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="px-4 py-4 sm:px-6">{children}</div>
    </section>
  )
}

export function EmptyHint({ text }: { text: string }) {
  return <p className="py-2 text-sm text-muted-foreground">{text}</p>
}
