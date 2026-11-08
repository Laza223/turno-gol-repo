'use client'

import { useCallback, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { SlotPanelActions } from '@/components/booking/slot-panel/actions'
import type { GridBooking } from '@/lib/booking/grid-cells'
import { listToChargeNow } from '@/lib/dashboard/today-board'
import { formatArs } from '@/lib/format'
import { WriteOffButton } from '@/components/booking/slot-panel/WriteOffButton'
import { ChargeCard } from './ChargeCard'
import type { HoyCourt } from './HoyChargeModal'

/**
 * "Cobrar varios": los turnos en rojo de esta noche como tarjetas lado a lado,
 * para cobrarlos sin abrir un modal por turno (decisión del dueño, 2026-11-07).
 *
 * **Los turnos se fijan al abrir.** Uno que se cobra se queda en su lugar con
 * "Cobrado ✓" (nada salta bajo el mouse) y uno que se pone en rojo con el
 * diálogo abierto se suma al final. El orden es el de las canchas.
 *
 * Cada tarjeta cobra por su cuenta (`ChargeCard`); este componente solo decide
 * qué tarjetas hay. Mientras está abierto el dueño de la pantalla no debe
 * refrescarla por debajo.
 */
export function CobrarVariosDialog({
  bookings,
  courts,
  nowMs,
  actions,
  onMutated,
  onOpenBooking,
  onClose,
}: {
  /** Los turnos del día, vivos: se actualizan con cada refresco. */
  bookings: readonly GridBooking[]
  courts: HoyCourt[]
  nowMs: number
  actions: SlotPanelActions
  /** Se cobró algo: refrescar la pantalla. */
  onMutated: () => void
  /** "Ver todo el turno": abre el modal completo encima de este diálogo. */
  onOpenBooking: (bookingId: string) => void
  onClose: () => void
}) {
  const current = listToChargeNow(bookings, courts, nowMs)
  // Tarjetas con un cobro en curso: mientras haya alguna, el diálogo no se cierra.
  const busy = useRef(new Set<string>())
  const onBusyChange = useCallback((id: string, isBusy: boolean) => {
    if (isBusy) busy.current.add(id)
    else busy.current.delete(id)
  }, [])
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => current.map((b) => b.id))

  // Los que se ponen en rojo con el diálogo abierto se suman al final.
  const known = new Set(pinnedIds)
  const arrived = current.filter((b) => !known.has(b.id)).map((b) => b.id)
  if (arrived.length > 0) setPinnedIds([...pinnedIds, ...arrived])

  const byId = new Map(bookings.map((b) => [b.id, b]))
  const cards = pinnedIds
    .map((id) => byId.get(id))
    // Un turno cancelado o movido mientras tanto ya no es para cobrar.
    .filter((b): b is GridBooking => b !== undefined && !b.status.startsWith('canceled'))

  const remaining = cards.reduce((sum, b) => sum + Math.max(0, b.pending ?? 0), 0)
  const remainingCount = cards.filter((b) => (b.pending ?? 0) > 0).length

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return
        // Igual que el modal de un turno: un cierre por error dejaría el resultado sin mirar.
        if (busy.current.size > 0) return
        // Al cerrar se refresca siempre: un cobro cortado por la red pudo haber
        // entrado, y el aviso de reintento vive en las tarjetas que se desmontan.
        onMutated()
        onClose()
      }}
    >
      <DialogContent
        className="max-w-5xl grid-cols-1 gap-0 p-0 focus:outline-hidden md:max-h-[calc(100dvh-2rem)]"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
        }}
      >
        <div className="border-b border-border p-4 pr-14 lg:p-5 lg:pr-14">
          <DialogTitle className="font-display text-lg leading-tight">Cobrar turnos</DialogTitle>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            {remainingCount === 0
              ? 'No queda nada por cobrar.'
              : `${remainingCount === 1 ? 'Falta cobrar 1 turno' : `Faltan cobrar ${remainingCount} turnos`} · ${formatArs(remaining)}`}
          </p>
        </div>
        <ul className="grid min-h-0 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 lg:p-5 xl:grid-cols-3">
          {cards.map((booking) => (
            <li key={booking.id} className="flex flex-col">
              <ChargeCard
                booking={booking}
                courtName={courts.find((c) => c.id === booking.courtId)?.name ?? 'Cancha'}
                capacity={courts.find((c) => c.id === booking.courtId)?.capacity}
                nowMs={nowMs}
                actions={actions}
                onMutated={onMutated}
                onOpenFull={() => onOpenBooking(booking.id)}
                onBusyChange={onBusyChange}
                extraActions={
                  // Toda tarjeta acá ya terminó y debe plata: solo falta que la
                  // pantalla haya cableado las acciones (Hoy y la Grilla lo hacen).
                  actions.writeOffBookingAction &&
                  actions.undoWriteOffAction &&
                  (booking.pending ?? 0) > 0 ? (
                    <WriteOffButton
                      bookingId={booking.id}
                      pendingCents={booking.pending ?? 0}
                      paidCents={booking.totalPaid ?? 0}
                      actions={{
                        writeOffBookingAction: actions.writeOffBookingAction,
                        undoWriteOffAction: actions.undoWriteOffAction,
                      }}
                      onDone={onMutated}
                    />
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
