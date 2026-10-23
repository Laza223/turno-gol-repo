import { BadgeCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TONE_BADGE } from '@/lib/status-tone'

/** El sello "Reservada en TurnoGol": tono success (el verde sutil de la tarjeta, no un botón). */
export function StampBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium',
        TONE_BADGE.success,
        className,
      )}
    >
      <BadgeCheck className="size-3.5" aria-hidden />
      Reservada en TurnoGol
    </span>
  )
}

/** Un chip de dato (formato, nivel): neutral, sin color de estado. */
export function FactPill({ children }: { children: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-medium',
        TONE_BADGE.neutral,
      )}
    >
      {children}
    </span>
  )
}

/** CTA primario de las tarjetas vacías y de "Armar un partido": 44 px, el único verde de la vista. */
export const RIVAL_CTA =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25'
