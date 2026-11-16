import { Shirt } from 'lucide-react'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { missingLabel } from '@/modules/rival/rival-display'
import { CupoBar } from '../../MatchBits'
import '@/components/booking/reserva.css'
import '../../rival.css'

const HEADLINE = 'rv-h2 text-[28px] tabular-nums'

/**
 * La grilla de camisetas, la barra del cupo y el contador (`.shirts` del mockup). Las llenas se
 * encienden en orden con su toque; cada una lleva una `key` con su estado, así que la que se llena
 * después (aceptar un pedido) se vuelve a montar y hace su toque sola. El contador cambia por
 * reemplazo (`key` + `.rv-swap`). "¡Estamos los N! Se juega." pulsa UNA vez (`animate-slot-pulse`)
 * y no se mueve con `prefers-reduced-motion`. Un partido jugado (`ended`) no lleva titular: "Faltan
 * 9" o "Se juega" ya no son ciertos. Un partido que busca rival con el equipo completo todavía no se
 * juega: la vista pasa `headline` para decirlo (`null` = sin titular, porque ya hay otro arriba;
 * texto = ese titular, sin pulso ni `role="status"`).
 */
export function ShirtGrid({
  capacity,
  confirmed,
  ended = false,
  headline,
}: {
  capacity: number
  confirmed: number
  ended?: boolean
  /** Reemplaza solo el titular del equipo completo; sin pasarlo es "¡Estamos los N! Se juega.". */
  headline?: string | null
}) {
  const filled = Math.min(confirmed, capacity)
  const full = confirmed >= capacity
  return (
    <div className="grid gap-3.5">
      {ended || (full && headline === null) ? null : full && headline !== undefined ? (
        <p className={HEADLINE}>{headline}</p>
      ) : full ? (
        <p
          role="status"
          className={cn(
            HEADLINE,
            'justify-self-start rounded-2xl animate-slot-pulse motion-reduce:animate-none',
          )}
        >
          ¡Estamos los {capacity}! Se juega.
        </p>
      ) : (
        <p key={capacity - confirmed} className={cn(HEADLINE, 'rv-swap')}>
          {missingLabel(capacity - confirmed)}
        </p>
      )}
      <CupoBar filled={filled} capacity={capacity} />
      <div role="img" aria-label={`Ya son ${filled} de ${capacity}`} className="ri-shirts">
        {Array.from({ length: capacity }, (_, i) => (
          <span
            key={`${i}-${i < filled ? 'on' : 'off'}`}
            aria-hidden
            className={cn('ri-shirt', i < filled && 'is-on')}
            style={{ '--i': i } as CSSProperties}
          >
            <Shirt />
          </span>
        ))}
      </div>
      <p key={filled} className="rv-small rv-swap tabular-nums">
        Ya son {filled} de {capacity}
      </p>
    </div>
  )
}
