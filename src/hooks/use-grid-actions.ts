'use client'

import { useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CourtRow } from '@/modules/courts/court.types'

export type SelectedSlot = {
  courtId: string
  courtName: string
  date: string
  timeStart: string
  durationMins: 60 | 120
  courtStatus?: 'online' | 'offline'
}

/**
 * Todo el estado de "qué superficie está abierta" de la grilla y sus handlers:
 * el modal completo (`selectedSlot`), el popover de alta rápida (`quickSlotKey`)
 * y el panel de acciones del turno (`detailBookingId`).
 *
 * Están juntos porque se cierran entre sí: abrir el modal cierra el popover,
 * crear una reserva cierra los dos. Repartidos en el componente esa relación
 * quedaba implícita en el orden de los `setState`.
 *
 * `refetch` viene de `useBookingRealtime` y NO es opcional en ningún camino que
 * mute datos: el hook lee `initialBookings` sólo al montar, así que un
 * `router.refresh()` solo dejaría la grilla pintando el estado viejo.
 */
export function useGridActions(params: {
  courts: CourtRow[]
  date: string
  /** Sin porcentaje de seña no se puede sugerir un monto: se cae al modal completo. */
  depositPercentage: number | undefined
  refetch: () => Promise<unknown> | void
}) {
  const { courts, date, depositPercentage, refetch } = params
  const router = useRouter()

  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)
  /** Celda con el popover de alta rápida abierto (Fase 3), como `courtId:HH:MM`. */
  const [quickSlotKey, setQuickSlotKey] = useState<string | null>(null)
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
  }, [router, refetch])

  const navigateToDate = useCallback(
    (d: string) => {
      startNavTransition(() => router.push(`/grilla?date=${d}`))
    },
    [router],
  )

  /** Abre el modal completo para un slot libre (el camino de "Más opciones"). */
  const openFullModal = useCallback(
    (courtId: string, slotTime: string) => {
      const court = courts.find((c) => c.id === courtId)
      if (!court) return
      setQuickSlotKey(null)
      setSelectedSlot({
        courtId,
        courtName: court.name,
        date,
        timeStart: slotTime,
        durationMins: 60,
        courtStatus: court.status,
      })
    },
    [courts, date],
  )

  /**
   * Fase 3: el click de una celda libre abre el POPOVER de alta rápida (2 campos
   * + precio ya resuelto), no el modal de 10 campos. El modal sigue a un click
   * de distancia ("Más opciones") y no perdió nada.
   *
   * Sin `depositPercentage` (stories, tests viejos) se cae al modal completo: el
   * popover no puede sugerir una seña sin saber el porcentaje del complejo.
   */
  const quickEnabled = typeof depositPercentage === 'number'

  const handleSlotClick = useCallback(
    (courtId: string, slotTime: string) => {
      if (!quickEnabled) {
        openFullModal(courtId, slotTime)
        return
      }
      setQuickSlotKey(`${courtId}:${slotTime}`)
    },
    [quickEnabled, openFullModal],
  )

  const closeQuick = useCallback(() => setQuickSlotKey(null), [])

  const handleBookingSuccess = useCallback(() => {
    setSelectedSlot(null)
    setQuickSlotKey(null)
    // Refresh both: router.refresh re-runs the server component (updates the
    // initialBookings prop), and refetch hits /api/bookings to update the
    // hook's local state — the hook's useState only reads initialBookings on
    // mount, so without an explicit refetch the new booking would only appear
    // when Realtime eventually pushes it. In E2E that lag misses the
    // assertion window; in a browser tab that lost the websocket, it never
    // arrives at all.
    router.refresh()
    void refetch()
  }, [router, refetch])

  return {
    quickEnabled,
    selectedSlot,
    setSelectedSlot,
    quickSlotKey,
    detailBookingId,
    setDetailBookingId,
    isNavPending,
    closeDetail,
    closeQuick,
    handleSlotMutated,
    navigateToDate,
    openFullModal,
    handleSlotClick,
    handleBookingSuccess,
  }
}
