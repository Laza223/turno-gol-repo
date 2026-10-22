import { Sparkles } from 'lucide-react'
import { TONE_BADGE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

/**
 * Marca de "TurnoGol Plus": lo pago con IA. Violeta exclusivo (DESIGN.md,
 * "TurnoGol Plus"); no comunica estado, eso lo dice la pastilla de al lado.
 */
export function PlusBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        TONE_BADGE.plus,
        className,
      )}
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      Plus
    </span>
  )
}
