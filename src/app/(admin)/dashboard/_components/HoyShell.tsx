'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CourtBoard,
  EarlierUnpaidBanner,
  type EarlierBooking,
} from '@/components/dashboard/CourtBoard'
import type { SlotPanelActions } from '@/components/booking/slot-panel/actions'
import { useNowMsAfterHydration } from '@/hooks/use-now'
import { rowDisplayName } from '@/lib/dashboard/day-bookings'
import { buildCourtBoard, type BoardBooking } from '@/lib/dashboard/today-board'
import { HoyChargeModal, type HoyCourt } from './HoyChargeModal'

/** Cada cuánto se refresca Hoy solo. Sin esto "Terminó hace N min" y "ahora" quedan
 *  viejos y no aparecen las reservas online que entraron mientras la pantalla
 *  estaba abierta, que en el mostrador es la pantalla que se deja prendida todo el día. */
const AUTO_REFRESH_MS = 60_000

/** Cada cuánto se recalcula qué turno empezó o terminó (sin volver al servidor). */
const CLOCK_TICK_MS = 30_000

/**
 * El tablero de Hoy con su modal de cobro. Es el dueño del turno abierto y del
 * reloj, y va POR ENCIMA de las listas: un `router.refresh()` reemplaza los
 * datos que llegan por props pero conserva el estado de este componente, así
 * que el modal no se desmonta a mitad de un cobro cuando la pantalla se revalida.
 *
 * El modal lee el turno de la lista COMPLETA del día y no del tablero: un turno
 * que se termina de pagar deja su cancha pero el modal sigue abierto mostrando
 * "Cobrado ✓" y el siguiente para cobrar. Si el turno de hoy desaparece de la
 * lista (se canceló o se pasó a otro día), el modal se cierra solo.
 *
 * Los turnos no cobrados de días anteriores llegan en otra lista que solo trae
 * los que DEBEN: el que se termina de pagar sale de ella. Por eso se guarda la
 * última versión vista del turno abierto y, si era de esa lista y se fue, el
 * modal lo muestra saldado en vez de cerrarse sin decir nada.
 */
export function HoyShell({
  bookings,
  earlier,
  courts,
  daySlots,
  dayIsClosed,
  canManageCourts,
  serverNowMs,
  cancellationPolicyHours,
  actions,
}: {
  /** Todos los turnos del día (todas las canchas), con sus instantes físicos. */
  bookings: BoardBooking[]
  /** Turnos jugados y no cobrados de días anteriores (los más recientes primero). */
  earlier: { bookings: EarlierBooking[]; count: number; pendingCents: number }
  courts: HoyCourt[]
  daySlots: string[]
  dayIsClosed: boolean
  canManageCourts: boolean
  /** La hora con la que el servidor armó esta respuesta: el reloj nunca va por detrás. */
  serverNowMs: number
  /** Horas de anticipación de la política de cancelación, para el aviso de seña del modal. */
  cancellationPolicyHours: number
  actions: SlotPanelActions
}) {
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()
  const [openId, setOpenId] = useState<string | null>(null)
  const [lastSeen, setLastSeen] = useState<{ booking: BoardBooking; earlier: boolean } | null>(null)

  // Antes de hidratar el hook devuelve 0, y entre ticks su valor puede ir por
  // detrás de la hora del servidor recién llegada: el máximo nunca retrocede.
  const clockMs = useNowMsAfterHydration(CLOCK_TICK_MS)
  const nowMs = Math.max(clockMs, serverNowMs)

  const board = useMemo(() => buildCourtBoard(bookings, courts, nowMs), [bookings, courts, nowMs])

  const today = openId ? bookings.find((b) => b.id === openId) : undefined
  const past = openId && !today ? earlier.bookings.find((b) => b.id === openId) : undefined
  const fresh = today ?? past ?? null
  if (fresh && fresh !== lastSeen?.booking) setLastSeen({ booking: fresh, earlier: !today })
  // Con la lista completa, un turno de un día anterior que se fue de ella se
  // terminó de pagar. Si la lista no entra entera (hay más de los que se traen),
  // pudo haberse corrido afuera sin cobrarse: ahí el modal se cierra en vez de
  // decir "Cobrado" sin saberlo.
  const earlierComplete = earlier.count <= earlier.bookings.length
  const openBooking =
    fresh ??
    (openId && lastSeen?.booking.id === openId && lastSeen.earlier && earlierComplete
      ? settledCopy(lastSeen.booking)
      : null)
  // El turno abierto de hoy dejó de existir (se canceló, se reprogramó a otro
  // día): se cierra el modal en vez de dejarlo mostrando un turno fantasma.
  if (openId && !openBooking) setOpenId(null)

  // El siguiente para cobrar, en el orden en que se ven las listas: primero lo
  // de hoy (lo que terminó, después lo que se juega) y después lo de días
  // anteriores. Así cobrar cinco turnos seguidos no obliga a cerrar el modal.
  const nextBooking = [...board.queue.now.map((item) => item.booking), ...earlier.bookings].find(
    (b) => b.id !== openId,
  )
  const next = nextBooking
    ? {
        name: rowDisplayName(nextBooking),
        courtName: courts.find((c) => c.id === nextBooking.courtId)?.name ?? '',
        onOpen: () => setOpenId(nextBooking.id),
      }
    : undefined

  // Con un modal abierto NO se refresca: revalidar por debajo de alguien que está
  // tipeando un monto le cambia el saldo a mitad de cobro.
  const paused = openId !== null
  useEffect(() => {
    if (paused) return
    const refreshIfVisible = () => {
      // Sin red NO: si el pedido RSC falla, Next cae a una navegación dura y el
      // mostrador se quedaría con la página de error del navegador en vez de la
      // última pantalla buena.
      if (document.visibilityState === 'visible' && navigator.onLine !== false) router.refresh()
    }
    const id = setInterval(refreshIfVisible, AUTO_REFRESH_MS)
    // Al volver a la pestaña también: puede haber estado horas en segundo plano.
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [paused, router])

  // Mientras la pantalla se refresca (por ejemplo, tras cerrar un cobro que se
  // cortó por la red) todavía muestra el saldo viejo: abrir un turno ahora
  // cobraría contra un saldo que ya no es el real.
  const openUnlessRefreshing = (id: string) => {
    if (!isRefreshing) setOpenId(id)
  }

  return (
    <div className="space-y-4">
      <CourtBoard
        board={board}
        courts={courts}
        nowMs={nowMs}
        dayIsClosed={dayIsClosed}
        canManageCourts={canManageCourts}
        onOpenBooking={openUnlessRefreshing}
      />

      {earlier.count > 0 && (
        <EarlierUnpaidBanner
          bookings={earlier.bookings}
          count={earlier.count}
          pendingCents={earlier.pendingCents}
          courts={courts}
          onOpenBooking={openUnlessRefreshing}
        />
      )}

      {openBooking && (
        <HoyChargeModal
          booking={openBooking}
          courtName={courts.find((c) => c.id === openBooking.courtId)?.name ?? ''}
          courts={courts}
          dayBookings={bookings}
          daySlots={daySlots}
          nowMs={nowMs}
          isRefreshing={isRefreshing}
          actions={actions}
          // En Hoy el modal no ofrece cantina ni "Marcar ausente" (pedido del dueño,
          // 2026-09-25): la venta está en la columna de al lado y el ausente se anota
          // desde la Grilla. Sin `renderCanteenDialog` el modal no ofrece la cantina.
          allowNoShow={false}
          next={next}
          onClose={() => setOpenId(null)}
          onMutated={() => startRefresh(() => router.refresh())}
          cancellationPolicyHours={cancellationPolicyHours}
        />
      )}
    </div>
  )
}

/** El turno como se vio la última vez, pero saldado: lo que se cobró fue lo que faltaba. */
function settledCopy(booking: BoardBooking): BoardBooking {
  const pending = booking.pending ?? 0
  return { ...booking, pending: 0, totalPaid: (booking.totalPaid ?? 0) + pending }
}
