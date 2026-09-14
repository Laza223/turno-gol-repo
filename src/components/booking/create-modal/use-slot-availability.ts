'use client'

import { useEffect, useState } from 'react'
import type { CheckSlotAvailabilityAction } from './types'

type Params = {
  checkAvailabilityAction?: CheckSlotAvailabilityAction
  slot: { courtId: string; date: string; timeStart: string }
}

/**
 * Chequeo optimista al abrir/cambiar el horario de inicio. Fail-open (nunca
 * bloquea por un fallo propio): un `false` es señal POSITIVA de que el turno
 * se ocupó, y ahí sí se avisa antes de que el server lo rechace con un error
 * críptico.
 */
export function useSlotAvailability({ checkAvailabilityAction, slot }: Params): boolean {
  const [taken, setTaken] = useState(false)

  useEffect(() => {
    if (!checkAvailabilityAction) return
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTaken(false)
    void (async () => {
      try {
        const res = await checkAvailabilityAction({
          courtId: slot.courtId,
          date: slot.date,
          timeStart: slot.timeStart,
        })
        if (!alive) return
        if (!res.available) setTaken(true)
      } catch {
        /* fail-open: un fallo del chequeo nunca bloquea el alta */
      }
    })()
    return () => {
      alive = false
    }
  }, [checkAvailabilityAction, slot.courtId, slot.date, slot.timeStart])

  return taken
}
