'use client'

import { useEffect, useState } from 'react'
import { Clock, RotateCcw } from 'lucide-react'
import { HOLD_TTL_SECONDS } from '@/lib/booking/hold'
import { TONE_BADGE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { ExampleTag } from './ExampleTag'

/** Arranca empezado: un reloj en 6:00 clavado parece una foto, no una cuenta. */
const START_SECONDS = HOLD_TTL_SECONDS - 18
/** Cuánto queda a la vista "se liberó" antes de volver a empezar. */
const RELEASED_SECONDS = 5

function clockLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * El reloj de la seña, a velocidad real: los 6 minutos que tiene el jugador
 * para pagar (`HOLD_TTL_SECONDS`, el mismo número que usa el hold). Al llegar
 * a cero muestra que el turno se liberó y vuelve a empezar.
 *
 * El servidor y el primer render del cliente pintan lo mismo (5:42), así que
 * no hay desajuste de hidratación. Con movimiento reducido no corre.
 */
export default function HoldClock() {
  const [left, setLeft] = useState(START_SECONDS)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => {
      setLeft((s) => (s <= -RELEASED_SECONDS ? HOLD_TTL_SECONDS : s - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  const released = left <= 0
  const pct = Math.max(0, left) / HOLD_TTL_SECONDS

  return (
    // El reloj corre cada segundo: se describe una vez con un rótulo fijo en
    // vez de leer los números, igual que los otros fragmentos de la página.
    <figure
      role="img"
      aria-label={`Ejemplo: el reloj de la seña. El jugador tiene ${HOLD_TTL_SECONDS / 60} minutos para pagar; si no paga, el turno se libera solo.`}
      className="card-premium rounded-2xl p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">Cancha 2 · Hoy 20:00</span>
        <ExampleTag />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="font-display text-[56px] font-bold leading-none tabular-nums tracking-[-0.03em] text-foreground sm:text-[64px]">
          {released ? '0:00' : clockLabel(left)}
        </p>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
            released ? TONE_BADGE.neutral : TONE_BADGE.warning,
          )}
        >
          {released ? (
            <RotateCcw className="h-3 w-3" aria-hidden />
          ) : (
            <Clock className="h-3 w-3" aria-hidden />
          )}
          {released ? 'Libre otra vez' : 'Esperando seña'}
        </span>
      </div>
      <p className="mt-2 text-base text-muted-foreground">
        {released
          ? 'No pagó a tiempo: el turno se liberó solo.'
          : 'le quedan para pagar la seña por MercadoPago'}
      </p>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <div
          className="h-full rounded-full bg-warning transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </figure>
  )
}
