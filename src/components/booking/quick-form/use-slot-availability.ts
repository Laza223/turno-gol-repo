'use client'

import { useEffect, useState } from 'react'
import type { CheckSlotAvailabilityAction } from '../BookingFormModal'
import type { Slot } from './constants'

type Params = {
  checkAvailabilityAction?: CheckSlotAvailabilityAction
  slot: Pick<Slot, 'courtId' | 'date' | 'timeStart'>
}

/**
 * Chequeo optimista al abrir. Es fail-open (devuelve `available: true` ante
 * cualquier fallo propio), así que un `false` es señal POSITIVA de que el
 * turno se ocupó: ahí sí se bloquea el submit. Sin mostrarlo, la carrera de
 * doble reserva quedaría solo en el exclusion constraint de la DB y el admin
 * vería un error críptico recién al confirmar.
 */
export function useSlotAvailability({ checkAvailabilityAction, slot }: Params): boolean {
  const [taken, setTaken] = useState(false)

  useEffect(() => {
    if (!checkAvailabilityAction) return
    let alive = true
    void (async () => {
      try {
        const res = await checkAvailabilityAction({
          courtId: slot.courtId,
          date: slot.date,
          timeStart: slot.timeStart,
        })
        // Guard de cancelación ANTES de tocar estado: si el efecto se re-corrió
        // (cambió el slot), esta respuesta ya es vieja y escribirla pisaría la
        // del slot nuevo.
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
