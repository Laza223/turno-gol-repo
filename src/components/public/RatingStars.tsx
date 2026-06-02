import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  rating: number
  count?: number
  /** 'compact' = una estrella + número; 'full' = 5 estrellas con relleno parcial. */
  variant?: 'compact' | 'full'
  className?: string
}

/**
 * Calificación promedio. Hereda el color del texto del contenedor
 * (funciona en cards claras y oscuras); solo la estrella es ámbar.
 * Accesible: role="img" + aria-label descriptivo.
 */
export default function RatingStars({ rating, count, variant = 'compact', className }: Props) {
  const rounded = Math.round(rating * 10) / 10
  const label =
    count && count > 0
      ? `${rounded.toFixed(1)} de 5 estrellas, ${count} reseña${count === 1 ? '' : 's'}`
      : `${rounded.toFixed(1)} de 5 estrellas`

  if (variant === 'compact') {
    return (
      <span
        role="img"
        aria-label={label}
        className={cn('inline-flex items-center gap-1 text-sm', className)}
      >
        <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
        <span className="font-semibold tabular-nums">{rounded.toFixed(1)}</span>
        {typeof count === 'number' && count > 0 && (
          <span className="text-xs tabular-nums opacity-60">({count})</span>
        )}
      </span>
    )
  }

  return (
    <span
      role="img"
      aria-label={label}
      className={cn('inline-flex items-center gap-1', className)}
    >
      <span className="flex gap-0.5">
        {[0, 1, 2, 3, 4].map((i) => {
          const filled = rating >= i + 1
          const half = !filled && rating > i
          return (
            <span key={i} className="relative inline-flex h-4 w-4">
              <Star className="absolute inset-0 h-4 w-4 text-amber-400" aria-hidden />
              {(filled || half) && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={half ? { width: `${(rating - i) * 100}%` } : undefined}
                >
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
                </span>
              )}
            </span>
          )
        })}
      </span>
      {typeof count === 'number' && (
        <span className="ml-1 text-sm tabular-nums opacity-70">
          {rounded.toFixed(1)} ({count})
        </span>
      )}
    </span>
  )
}
