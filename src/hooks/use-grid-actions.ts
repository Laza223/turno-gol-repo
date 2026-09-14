'use client'

import { useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CourtRow } from '@/modules/courts/court.types'

export type SelectedSlot = {
  courtId: string
  courtName: string
  date: string
  timeStart: string
}

/**
 * Todo el estado de "qué superficie está abierta" de la grilla y sus handlers:
 * el modal de alta (`selectedSlot`) y el panel de acciones del turno
 * (`detailBookingId`).
 *
 * Están juntos porque se cierran entre sí: crear una reserva cierra el modal Y
 * podría afectar el panel. Repartidos en el componente esa relación quedaba
 * implícita en el orden de los `setState`.
 *
 * `refetch` viene de `useBookingRealtime` y NO es opcional en ningún camino que
 * mute datos: el hook lee `initialBookings` sólo al montar, así que un
 * `router.refresh()` solo dejaría la grilla pintando el estado viejo.
 */
export function useGridActions(params: {
  courts: CourtRow[]
  date: string
  refetch: () => Promise<unknown> | void
}) {
  const { courts, date, refetch } = params
  const router = useRouter()

  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)
  /** Reserva con el panel de acciones abierto. Una sola a la vez. */
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null)
  /**
   * Navegación entre días sin reload: la transición mantiene la grilla vieja
   * visible (atenuada) hasta que llega el server component del día nuevo.
   */
  const [isNavPending, startNavTransition] = useTransition()

  /**
   * Radix devuelve el foco al elemento que lo tenía al abrir (la celda), así que
   * la navegación por flechas sigue donde estaba. Sólo hay que limpiar el id.
   */
  const closeDetail = useCallback(() => setDetailBookingId(null), [])

  /**
   * El panel cobró / marcó ausente: hay que refrescar los DOS lados, igual que
   * al crear una reserva.
   *
   * `router.refresh()` solo no alcanza: el hook de Realtime lee
   * `initialBookings` únicamente al montar, así que la grilla seguiría pintando
   * el estado viejo. Con la alarma de "sin cobrar" eso es peor que un refresco
   * tardío: el turno se queda en rojo DESPUÉS de haberlo cobrado, y una alarma
   * que miente entrena al staff a ignorarlas. Además los cobros viven en
   * `cash_flows`, que no emite por el canal de Realtime — nadie más va a avisar.
   */
  const handleSlotMutated = useCallback(() => {
    setDetailBookingId(null)
    router.refresh()
    void refetch()
    // Cubre addBookingChargeAction / completeAndChargeBookingAction /
    // chargeDebtAction (también corre para marcar ausencia, que no mueve
    // plata: cuesta un fetch de más que devuelve el mismo número).
  }, [router, refetch])

  const navigateToDate = useCallback(
    (d: string) => {
      startNavTransition(() => router.push(`/grilla?date=${d}`))
    },
    [router],
  )

  /**
   * Tocar una celda libre abre DIRECTO el modal de alta (§3bis, decisión
   * 2026-09-14): no hay superficie intermedia — el alta rápida se eliminó.
   */
  const handleSlotClick = useCallback(
    (courtId: string, slotTime: string) => {
      const court = courts.find((c) => c.id === courtId)
      if (!court) return
      setSelectedSlot({ courtId, courtName: court.name, date, timeStart: slotTime })
    },
    [courts, date],
  )

  const handleBookingSuccess = useCallback(() => {
    setSelectedSlot(null)
    // Refresh both: router.refresh re-runs the server component (updates the
    // initialBookings prop), and refetch hits /api/bookings to update the
    // hook's local state — the hook's useState only reads initialBookings on
    // mount, so without an explicit refetch the new booking would only appear
    // when Realtime eventually pushes it. In E2E that lag misses the
    // assertion window; in a browser tab that lost the websocket, it never
    // arrives at all.
    router.refresh()
    void refetch()
    // Cubre el alta con seña cobrada en mostrador (recordManualBookingDepositCashFlow).
  }, [router, refetch])

  return {
    selectedSlot,
    setSelectedSlot,
    detailBookingId,
    setDetailBookingId,
    isNavPending,
    closeDetail,
    handleSlotMutated,
    navigateToDate,
    handleSlotClick,
    handleBookingSuccess,
  }
}
