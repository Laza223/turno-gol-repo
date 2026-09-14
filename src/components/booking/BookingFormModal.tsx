'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { formatDateLong } from '@/lib/format'
import { track } from '@/shared/observability/breadcrumbs'
import { cn } from '@/lib/utils'
import { TypePicker } from './create-modal/TypePicker'
import { TurnoForm } from './create-modal/TurnoForm'
import { TurnoFijoForm } from './create-modal/TurnoFijoForm'
import { EventoForm } from './create-modal/EventoForm'
import { BloqueoForm } from './create-modal/BloqueoForm'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtPricingData } from '@/modules/courts/court.types'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type {
  BookingKind,
  CheckSlotAvailabilityAction,
  CreateAbonadoAction,
  CreateBookingAction,
  ModalSlot,
  SearchBookingPlayersAction,
} from './create-modal/types'

export type {
  CheckSlotAvailabilityAction,
  CreateAbonadoAction,
  CreateBookingAction,
  SearchBookingPlayersAction,
  SearchBookingPlayersResult,
} from './create-modal/types'

type Props = {
  slot: ModalSlot
  pricing: CourtPricingData
  /** Reservas de TODA la grilla del día (se filtran acá por `slot.courtId`) — sin query nueva. */
  dayBookings: GridBooking[]
  daySlots: string[]
  isSlotPast: (slotTime: string) => boolean
  open: boolean
  onClose: () => void
  onSuccess: (booking?: BookingRow) => void
  createBookingAction: CreateBookingAction
  createAbonadoAction: CreateAbonadoAction
  checkAvailabilityAction?: CheckSlotAvailabilityAction
  searchPlayersAction?: SearchBookingPlayersAction
}

/**
 * Modal único de alta desde la grilla (pages/grilla.md §3bis, decisión
 * 2026-09-14). Reemplaza al alta rápida (popover) y al modal viejo de chips +
 * "Opciones avanzadas": arranca preguntando "¿Qué vas a agendar?" y cada tipo
 * — Turno / Turno fijo / Evento / Bloquear cancha — muestra sólo sus campos.
 *
 * Shell fino: sólo decide el tipo elegido y monta el form correspondiente
 * (`create-modal/`). La lógica de cada tipo —validación, payload, submit—
 * vive en su propio archivo.
 */
export function BookingFormModal({
  slot,
  pricing,
  dayBookings,
  daySlots,
  isSlotPast,
  open,
  onClose,
  onSuccess,
  createBookingAction,
  createAbonadoAction,
  checkAvailabilityAction,
  searchPlayersAction,
}: Props) {
  const [kind, setKind] = useState<BookingKind>('turno')
  const resolvedRef = useRef(false)
  const openedAtRef = useRef(0)
  // `create_modal.abandoned` se emite en el cleanup del efecto de montaje
  // (deps `[]`, corre una sola vez), así que closurea el `kind` de la
  // primera render — un ref actualizado en un efecto aparte lo mantiene al
  // día con el tipo que el usuario tenía elegido cuando cerró sin confirmar.
  // (mutar el ref DURANTE el render viola `react-hooks/refs`.)
  const kindRef = useRef(kind)
  useEffect(() => {
    kindRef.current = kind
  }, [kind])

  useEffect(() => {
    openedAtRef.current = Date.now()
    resolvedRef.current = false
    track.grid('create_modal.opened', { kind: 'turno' })
    return () => {
      if (!resolvedRef.current) {
        track.grid('create_modal.abandoned', {
          kind: kindRef.current,
          durationMs: Date.now() - openedAtRef.current,
        })
      }
    }
    // Se monta y desmonta una vez por apertura (GridOverlays sólo renderiza el
    // modal mientras hay un slot seleccionado).
  }, [])

  function trackConfirmed(extra?: { withPlayer?: boolean; withDeposit?: boolean }) {
    track.grid('create_modal.confirmed', {
      kind,
      durationMs: Date.now() - openedAtRef.current,
      ...extra,
    })
  }

  const courtBookings = useMemo(
    () => dayBookings.filter((b) => b.courtId === slot.courtId),
    [dayBookings, slot.courtId],
  )

  function handleSuccess(booking?: BookingRow) {
    resolvedRef.current = true
    onSuccess(booking)
  }

  function handleOpenChange(next: boolean) {
    if (!next) onClose()
  }

  const formProps = {
    slot,
    courtBookings,
    daySlots,
    pricing,
    isSlotPast,
    checkAvailabilityAction,
    searchPlayersAction,
    createBookingAction,
    createAbonadoAction,
    onClose,
    onSuccess: handleSuccess,
    trackConfirmed,
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 dark:bg-black/80" />
        <Dialog.Content
          className={cn(
            'fixed inset-0 z-50 flex flex-col bg-popover text-popover-foreground shadow-2xl outline-hidden',
            'lg:inset-auto lg:left-1/2 lg:top-1/2 lg:h-[min(48rem,90dvh)] lg:max-h-[90dvh] lg:w-full lg:max-w-6xl lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:border lg:border-border',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-300',
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border p-4 lg:px-6">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-bold tracking-tight text-foreground">
                Nueva reserva
              </Dialog.Title>
              <Dialog.Description className="truncate text-sm text-muted-foreground">
                {slot.courtName} · {formatDateLong(slot.date)} · {slot.timeStart}
              </Dialog.Description>
            </div>
            <Dialog.Close className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-70 transition-opacity hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" />
              <span className="sr-only">Cerrar</span>
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
            <TypePicker value={kind} onChange={setKind} />
            {kind === 'turno' && <TurnoForm key="turno" {...formProps} />}
            {kind === 'fijo' && <TurnoFijoForm key="fijo" {...formProps} />}
            {kind === 'evento' && <EventoForm key="evento" {...formProps} />}
            {kind === 'bloqueo' && <BloqueoForm key="bloqueo" {...formProps} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
