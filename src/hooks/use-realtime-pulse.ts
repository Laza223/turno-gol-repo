'use client'

import { useEffect, useRef, useState } from 'react'
import type { CourtRow } from '@/modules/courts/court.types'
import type { GridBooking } from '@/lib/booking/grid-cells'

/**
 * Pulso de atención Realtime (MASTER §5.3): toda reserva que aparece DESPUÉS del
 * primer render pulsa una sola vez (700ms) y luego se retira de `pulseIds` para
 * que un re-render no repita la animación. El set inicial se siembra sin pulsar.
 * `lastArrival` es el anuncio accesible (aria-live) de la última reserva nueva.
 */
export function useRealtimePulse(
  bookings: GridBooking[],
  courts: CourtRow[],
): { pulseIds: ReadonlySet<string>; lastArrival: string | null } {
  const seenIdsRef = useRef<Set<string> | null>(null)
  const [pulseIds, setPulseIds] = useState<ReadonlySet<string>>(() => new Set())
  const [lastArrival, setLastArrival] = useState<string | null>(null)

  useEffect(() => {
    const ids = new Set(bookings.map((b) => b.id))
    if (seenIdsRef.current === null) {
      seenIdsRef.current = ids
      return
    }
    const fresh = bookings.filter((b) => !seenIdsRef.current!.has(b.id))
    seenIdsRef.current = ids
    if (fresh.length === 0) return

    setPulseIds((prev) => {
      const next = new Set(prev)
      for (const b of fresh) next.add(b.id)
      return next
    })
    const first = fresh[0]!
    const courtName = courts.find((c) => c.id === first.courtId)?.name
    setLastArrival(`Nueva reserva: ${first.timeStart}${courtName ? ` en ${courtName}` : ''}`)
    // Fire-and-forget: la animación corre una sola vez; la clase se retira
    // apenas termina para que un re-render no la repita.
    const pulseTimer = setTimeout(() => {
      setPulseIds((prev) => {
        const next = new Set(prev)
        for (const b of fresh) next.delete(b.id)
        return next
      })
    }, 700)
    return () => clearTimeout(pulseTimer)
  }, [bookings, courts])

  return { pulseIds, lastArrival }
}
