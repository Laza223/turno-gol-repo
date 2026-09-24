'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { TodayBoard } from '@/components/dashboard/TodayBoard'
import type { RenderCanteenDialog, SlotPanelActions } from '@/components/booking/slot-panel/actions'
import { useNowMsAfterHydration } from '@/hooks/use-now'
import { buildTodayBoard, type BoardBooking } from '@/lib/dashboard/today-board'
import type {
  ListCanteenCatalog,
  SellTicketForBooking,
} from '@/app/(admin)/grilla/_components/BookingCanteenDialog'
import { HoyChargeModal, type HoyCourt } from './HoyChargeModal'

// Se carga recién al abrir la cantina de un turno: el catálogo se pide al abrir.
const BookingCanteenDialog = dynamic(
  () =>
    import('@/app/(admin)/grilla/_components/BookingCanteenDialog').then(
      (m) => m.BookingCanteenDialog,
    ),
  { ssr: false },
)

/** Cada cuánto se refresca Hoy solo. Sin esto "Terminó hace N min" y "ahora" quedan
 *  viejos y no aparecen las reservas online que entraron mientras la pantalla
 *  estaba abierta, que en el mostrador es la pantalla que se deja prendida todo el día. */
const AUTO_REFRESH_MS = 60_000

/** Cada cuánto se recalcula qué turno terminó / cuál sigue (sin volver al servidor). */
const CLOCK_TICK_MS = 30_000

type Occupancy = { occupied: number; available: number; blocked: number; pct: number }

/**
 * El tablero de Hoy con su modal de cobro. Es el dueño del turno abierto y del
 * reloj, y va POR ENCIMA de la lista: un `router.refresh()` reemplaza los datos
 * que llegan por props pero conserva el estado de este componente, así que el
 * modal no se desmonta a mitad de un cobro cuando la pantalla se revalida.
 *
 * El modal lee el turno de la lista COMPLETA del día y no del tablero filtrado:
 * un turno que se termina de pagar sale del tablero pero el modal sigue abierto
 * mostrando "Cobrado ✓". Y si el turno desaparece de la lista (se canceló o se
 * pasó a otro día), el modal se cierra solo.
 */
export function HoyShell({
  bookings,
  courts,
  daySlots,
  occupancy,
  dayIsClosed,
  canManageCourts,
  serverNowMs,
  cancellationPolicyHours,
  actions,
  canteen,
}: {
  /** Todos los turnos del día (todas las canchas), con sus instantes físicos. */
  bookings: BoardBooking[]
  courts: HoyCourt[]
  daySlots: string[]
  occupancy: Occupancy
  dayIsClosed: boolean
  canManageCourts: boolean
  /** La hora con la que el servidor armó esta respuesta: el reloj nunca va por detrás. */
  serverNowMs: number
  /** Horas de anticipación de la política de cancelación, para el aviso de seña del modal. */
  cancellationPolicyHours: number
  actions: SlotPanelActions
  canteen: { listCatalogAction: ListCanteenCatalog; sellTicketAction: SellTicketForBooking }
}) {
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()
  const [openId, setOpenId] = useState<string | null>(null)

  // Antes de hidratar el hook devuelve 0, y entre ticks su valor puede ir por
  // detrás de la hora del servidor recién llegada: el máximo nunca retrocede.
  const clockMs = useNowMsAfterHydration(CLOCK_TICK_MS)
  const nowMs = Math.max(clockMs, serverNowMs)

  const columns = useMemo(() => buildTodayBoard(bookings, courts, nowMs), [bookings, courts, nowMs])

  const openBooking = openId ? (bookings.find((b) => b.id === openId) ?? null) : null
  // El turno abierto dejó de existir en la lista (se canceló, se reprogramó a
  // otro día): se cierra el modal en vez de dejarlo mostrando un turno fantasma.
  if (openId && !openBooking) setOpenId(null)

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

  const renderCanteenDialog: RenderCanteenDialog = (args) => (
    <BookingCanteenDialog
      {...args}
      listCatalogAction={canteen.listCatalogAction}
      sellTicketAction={canteen.sellTicketAction}
    />
  )

  return (
    <>
      <TodayBoard
        columns={columns}
        nowMs={nowMs}
        occupancy={occupancy}
        dayIsClosed={dayIsClosed}
        canManageCourts={canManageCourts}
        // Mientras la pantalla se refresca (por ejemplo, tras cerrar un cobro que se
        // cortó por la red) todavía muestra el saldo viejo: abrir el turno ahora
        // cobraría contra un saldo que ya no es el real.
        onOpenBooking={(id) => {
          if (!isRefreshing) setOpenId(id)
        }}
      />

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
          renderCanteenDialog={renderCanteenDialog}
          onClose={() => setOpenId(null)}
          onMutated={() => startRefresh(() => router.refresh())}
          cancellationPolicyHours={cancellationPolicyHours}
        />
      )}
    </>
  )
}
