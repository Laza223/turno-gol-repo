'use client'

import { useEffect, useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { ListRescheduleSlots, RescheduleBooking } from './BookingRescheduleDialog'

/**
 * Confirmación de "mover arrastrando" (el gesto vive en `useGridDrag`). Soltar
 * un turno sobre un hueco no lo mueve: abre esto, que pregunta al server si el
 * hueco sigue libre y cuánto vale esa franja, y recién ahí mueve con la MISMA
 * acción que el diálogo de Reprogramar. El precio sigue a la franja (decisión
 * de producto de `BookingRescheduleDialog`), así que un cambio de plata se avisa
 * ANTES, no en la caja.
 */

export type MoveRequest = {
  booking: GridBooking
  fromCourtName: string
  toCourtId: string
  toCourtName: string
  date: string
  timeStart: string
  timeEnd: string
}

type Lookup =
  | { status: 'ok'; price: number | null; available: boolean; listed: boolean }
  | { status: 'error'; message: string }

type Props = {
  request: MoveRequest
  listSlotsAction: ListRescheduleSlots
  rescheduleAction: RescheduleBooking
  onClose: () => void
  onSuccess: () => void
}

function bookingLabel(b: GridBooking): string {
  if (b.guestName) return b.guestName
  if (b.playerFirstName) return `${b.playerFirstName} ${b.playerLastName ?? ''}`.trim()
  return 'Turno'
}

export function BookingMoveDialog({
  request,
  listSlotsAction,
  rescheduleAction,
  onClose,
  onSuccess,
}: Props) {
  const { booking, toCourtId, date, timeStart, timeEnd } = request
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    // `alive`: el diálogo puede cerrarse (o cambiar el destino) con la consulta
    // en vuelo; la respuesta tardía no debe pisar el estado nuevo.
    let alive = true
    void (async () => {
      try {
        const res = await listSlotsAction({ courtId: toCourtId, date })
        if (!alive) return
        if (!res.success) {
          setLookup({ status: 'error', message: res.error })
          return
        }
        const slot = res.slots.find((s) => s.timeStart === timeStart)
        // Sin el hueco en la lista = el día no acepta reservas (fuera de los
        // días de anticipación); con el hueco no disponible = ya lo ocuparon.
        setLookup({
          status: 'ok',
          price: slot?.price ?? null,
          available: slot?.available ?? false,
          listed: slot !== undefined,
        })
      } catch (err) {
        Sentry.captureException(err)
        if (alive) {
          setLookup({
            status: 'error',
            message: 'No pudimos revisar el horario. Revisá tu conexión.',
          })
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [listSlotsAction, toCourtId, date, timeStart])

  // Una sesión de abonado conserva el precio del contrato (el server lo impone).
  const keepsContractPrice = booking.type === 'fixed'
  const priceDelta =
    !keepsContractPrice && lookup?.status === 'ok' && lookup.price != null
      ? lookup.price - booking.priceSnapshot
      : 0
  const unavailable = lookup?.status === 'ok' && !lookup.available

  function confirm() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await rescheduleAction({
          bookingId: booking.id,
          courtId: toCourtId,
          date,
          timeStart,
          timeEnd,
        })
        if (!res.success) {
          startTransition(() => setError(res.error ?? 'No se pudo mover el turno.'))
          return
        }
        toast({
          title: 'Turno movido',
          description: res.priceChanged
            ? `El precio cambió a ${formatArs(res.booking?.priceSnapshot ?? booking.priceSnapshot)}.`
            : undefined,
          variant: 'success',
        })
        onSuccess()
      } catch (err) {
        Sentry.captureException(err)
        startTransition(() =>
          setError('No se pudo mover el turno. Revisá tu conexión e intentá de nuevo.'),
        )
      }
    })
  }

  const lookingUp = lookup === null

  return (
    <Dialog open onOpenChange={(v) => !v && !isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>¿Mover el turno de {bookingLabel(booking)}?</DialogTitle>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Ahora</dt>
          <dd className="font-medium tabular-nums">
            {request.fromCourtName} · {booking.timeStart}–{booking.timeEnd}
          </dd>
          <dt className="text-muted-foreground">Pasa a</dt>
          <dd className="font-semibold tabular-nums">
            {request.toCourtName} · {timeStart}–{timeEnd}
          </dd>
        </dl>

        {lookingUp && <p className="text-sm text-muted-foreground">Revisando el horario…</p>}

        {unavailable && (
          <p role="alert" className="text-xs text-red-700 dark:text-red-300">
            {lookup.listed
              ? 'Ese horario ya no está libre.'
              : 'Ese día todavía no acepta reservas. Usá Reprogramar para elegir otra fecha.'}
          </p>
        )}

        {lookup?.status === 'error' && (
          <p role="alert" className="text-xs text-red-700 dark:text-red-300">
            {lookup.message}
          </p>
        )}

        {keepsContractPrice && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
            Turno fijo: se mueve solo este turno y sigue costando {formatArs(booking.priceSnapshot)}
            .
          </p>
        )}

        {priceDelta !== 0 && lookup?.status === 'ok' && (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            El precio pasa de {formatArs(booking.priceSnapshot)} a{' '}
            {formatArs(lookup.price ?? booking.priceSnapshot)} ({priceDelta > 0 ? '+' : ''}
            {formatArs(priceDelta)}): esa franja tiene otra tarifa.
          </p>
        )}

        {booking.playerFirstName && (
          <p className="text-xs text-muted-foreground">
            Le mandamos un mail al jugador con el cambio.
          </p>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-700 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-11 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60 md:h-10"
          >
            No mover
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={lookup?.status !== 'ok' || unavailable || isPending}
            className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 md:h-10"
          >
            {isPending ? 'Moviendo…' : 'Mover turno'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
