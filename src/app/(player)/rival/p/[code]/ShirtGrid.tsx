import { Shirt } from 'lucide-react'
import { cn } from '@/lib/utils'
import { missingLabel } from '@/modules/rival/rival-display'

/**
 * La grilla de camisetas y el contador. Confirmadas en esmeralda, vacías con trazo punteado.
 * "¡Estamos los N! Se juega." pulsa UNA vez (600 ms, `animate-slot-pulse`) y no se mueve con
 * `prefers-reduced-motion`. El contador va en Archivo tabular. Un partido jugado (`ended`) no lleva
 * titular: "Faltan 9" o "Se juega" ya no son ciertos.
 */
export function ShirtGrid({
  capacity,
  confirmed,
  ended = false,
}: {
  capacity: number
  confirmed: number
  ended?: boolean
}) {
  const filled = Math.min(confirmed, capacity)
  const full = confirmed >= capacity
  return (
    <div className="space-y-4">
      {ended ? null : full ? (
        <p
          role="status"
          className="inline-block rounded-2xl font-display text-3xl font-black italic leading-tight tracking-tight text-foreground tabular-nums animate-slot-pulse motion-reduce:animate-none"
        >
          ¡Estamos los {capacity}! Se juega.
        </p>
      ) : (
        <p className="font-display text-4xl font-black italic leading-none tracking-tight text-foreground tabular-nums">
          {missingLabel(capacity - confirmed)}
        </p>
      )}
      <div
        role="img"
        aria-label={`${filled} de ${capacity} confirmados`}
        className="flex flex-wrap gap-2"
      >
        {Array.from({ length: capacity }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              'flex size-11 items-center justify-center rounded-xl',
              i < filled
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30'
                : 'border-2 border-dashed border-input text-muted-foreground',
            )}
          >
            <Shirt className="size-5" />
          </span>
        ))}
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">
        {confirmed} de {capacity} confirmados
      </p>
    </div>
  )
}
