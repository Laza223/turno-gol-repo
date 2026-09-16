'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { toast } from '@/hooks/use-toast'
import { priceForRange } from '@/lib/booking/pricing'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtPricingData } from '@/modules/courts/court.types'
import type { ActionResult } from '@/shared/types/action-result'
import { durationHours, endTimeOptions } from './create-modal/time-options'
import { selectClass } from './create-modal/styles'

/**
 * Editar una reserva desde la grilla (D2, 2026-09-15): nombre/teléfono de
 * invitado, duración de un evento cargado por el staff y precio — sin mover
 * el turno (eso sigue siendo `BookingRescheduleDialog`).
 *
 * `guestPhone`/`createdByStaff` no viajan en `GridBooking` (no los necesita
 * el resto de la grilla, y sumarlos ensancharía Realtime): se piden recién acá,
 * al abrir, con `getDetailAction`. Mientras esa lectura no resuelve, el
 * formulario muestra un estado de carga en vez de arrancar con un teléfono
 * vacío que no es "sin teléfono" sino "todavía no lo sabemos".
 */

export type EditBookingDetail =
  | { success: true; guestPhone: string | null; createdByStaff: string | null }
  | { success: false; error: string }

export type GetBookingEditDetail = (bookingId: string) => Promise<EditBookingDetail>

export type EditBookingInput = {
  bookingId: string
  guestName?: string
  guestPhone?: string
  timeEnd?: string
  priceOverride?: number
}

export type EditBooking = (input: EditBookingInput) => Promise<ActionResult>

type PriceMode = 'priced' | 'free'

type Props = {
  /** El caller monta este diálogo SOLO cuando está abierto (mismo patrón que BookingRescheduleDialog). */
  open: boolean
  onOpenChange: (open: boolean) => void
  booking: GridBooking
  /** Todas las reservas del día (todas las canchas) — se filtran acá por cancha y turno propio. */
  dayBookings: GridBooking[]
  daySlots: string[]
  /** Sin esto no hay sugerido al cambiar la duración: el admin escribe el precio a mano. */
  pricing?: CourtPricingData
  getDetailAction: GetBookingEditDetail
  editAction: EditBooking
  onSuccess: () => void
}

export function BookingEditDialog({
  open,
  onOpenChange,
  booking,
  dayBookings,
  daySlots,
  pricing,
  getDetailAction,
  editAction,
  onSuccess,
}: Props) {
  const [detail, setDetail] = useState<{
    guestPhone: string | null
    createdByStaff: string | null
  } | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await getDetailAction(booking.id)
        if (!alive) return
        if (!res.success) {
          setDetailError(res.error)
          return
        }
        setDetail({ guestPhone: res.guestPhone, createdByStaff: res.createdByStaff })
      } catch (err) {
        Sentry.captureException(err)
        if (!alive) return
        setDetailError('No pudimos cargar los datos de la reserva.')
      }
    })()
    return () => {
      alive = false
    }
  }, [booking.id, getDetailAction])

  // Invitado = sin jugador registrado. `GridBooking` no trae `playerId`, pero
  // `playerFirstName` es null exactamente cuando lo es (mismo proxy que usa
  // `displayName` en BookingSlotPanel).
  const isGuest = !booking.playerFirstName

  const [name, setName] = useState(booking.guestName ?? '')
  // Patrón "derived state on prop change" (sin useEffect), igual que
  // BookingSlotPanel: `detail` llega async UNA vez y recién ahí se conoce el
  // teléfono — sembrar el campo desde un efecto dispararía un render en
  // cascada evitable (react-hooks/set-state-in-effect).
  const [phone, setPhone] = useState('')
  const [phoneSeededFrom, setPhoneSeededFrom] = useState<typeof detail>(null)
  if (detail && detail !== phoneSeededFrom) {
    setPhoneSeededFrom(detail)
    setPhone(detail.guestPhone ?? '')
  }

  // Duración: sólo un evento `spontaneous` cargado por el staff (nunca una
  // reserva online, D2) — mismo predicado que el server (`created_by_staff
  // IS NOT NULL`).
  const canEditDuration = booking.type === 'spontaneous' && detail?.createdByStaff != null

  // Sesión de abonado: a diferencia de reprogramar (que SIEMPRE conserva el
  // precio del contrato, BookingRescheduleDialog), acá SÍ se puede tocar —
  // decisión del dueño 2026-09-15 — pero sólo para esta fecha puntual. El
  // aviso evita que el encargado piense que está renegociando el contrato.
  const isAbonadoSession = booking.type === 'fixed'

  const courtBookings = useMemo(
    () => dayBookings.filter((b) => b.courtId === booking.courtId && b.id !== booking.id),
    [dayBookings, booking.courtId, booking.id],
  )
  const endOptions = useMemo(
    () =>
      canEditDuration
        ? endTimeOptions({ slots: daySlots, startTime: booking.timeStart, courtBookings })
        : [],
    [canEditDuration, daySlots, booking.timeStart, courtBookings],
  )
  const [timeEnd, setTimeEnd] = useState(booking.timeEnd)

  const [priceMode, setPriceMode] = useState<PriceMode>(
    booking.priceSnapshot === 0 ? 'free' : 'priced',
  )
  const [priceCents, setPriceCents] = useState<number | null>(booking.priceSnapshot)

  function handleEndChange(next: string) {
    setTimeEnd(next)
    if (!pricing) return
    const suggested = priceForRange(pricing, booking.date, booking.timeStart, next)
    if (suggested != null) {
      setPriceCents(suggested)
      setPriceMode('priced')
    }
  }

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending) return
    setError(null)

    const input: EditBookingInput = { bookingId: booking.id }

    if (isGuest) {
      const trimmedName = name.trim()
      if (!trimmedName) {
        setError('Poné un nombre.')
        return
      }
      input.guestName = trimmedName
      const trimmedPhone = phone.trim()
      if (trimmedPhone) input.guestPhone = trimmedPhone
    }

    const durationChanged = canEditDuration && timeEnd !== booking.timeEnd
    if (durationChanged) input.timeEnd = timeEnd

    const effectivePrice = priceMode === 'free' ? 0 : priceCents
    if (effectivePrice == null) {
      setError('Ingresá el precio del turno.')
      return
    }
    // El server EXIGE priceOverride cuando la duración cambia (ver
    // booking.edit.ts) — mandarlo siempre que cambia el precio o la duración
    // evita un rechazo evitable.
    if (durationChanged || effectivePrice !== booking.priceSnapshot) {
      input.priceOverride = effectivePrice
    }

    startTransition(async () => {
      try {
        const res = await editAction(input)
        if (!res.success) {
          setError(res.error)
          return
        }
        toast({ title: 'Reserva actualizada', variant: 'success' })
        onSuccess()
      } catch (err) {
        Sentry.captureException(err)
        setError('No pudimos guardar los cambios. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  const loading = !detail && !detailError

  return (
    <Dialog open={open} onOpenChange={(v) => !isPending && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar reserva</DialogTitle>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">Cargando…</p>}

        {!loading && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {isGuest && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-booking-name">Nombre</Label>
                  <input
                    id="edit-booking-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isPending}
                    className={selectClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-booking-phone">Teléfono</Label>
                  <input
                    id="edit-booking-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isPending}
                    className={selectClass}
                  />
                </div>
              </div>
            )}

            {canEditDuration && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-booking-end">Hasta</Label>
                <select
                  id="edit-booking-end"
                  value={timeEnd}
                  onChange={(e) => handleEndChange(e.target.value)}
                  disabled={isPending}
                  className={selectClass}
                >
                  {/* La duración actual siempre es una opción, aunque `endTimeOptions`
                      no la incluya (el turno ya la ocupa, así que no aparece como
                      "libre" en su propia lista). */}
                  {!endOptions.includes(booking.timeEnd) && (
                    <option value={booking.timeEnd}>
                      {booking.timeEnd} · {durationHours(booking.timeStart, booking.timeEnd)} h
                      (actual)
                    </option>
                  )}
                  {endOptions.map((t) => (
                    <option key={t} value={t}>
                      {t} · {durationHours(booking.timeStart, t)} h
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Precio</Label>
              <SegmentedControl
                className="grid grid-cols-2 gap-1.5"
                aria-label="Precio del turno"
                value={priceMode}
                onValueChange={setPriceMode}
                itemClassName={(active) =>
                  active
                    ? 'h-11 md:h-9 cursor-pointer rounded-lg border border-primary bg-primary text-xs font-semibold text-primary-foreground transition-colors'
                    : 'h-11 md:h-9 cursor-pointer rounded-lg border border-border bg-card text-xs font-semibold transition-colors hover:bg-accent'
                }
                options={[
                  { value: 'priced', label: 'Tiene precio' },
                  { value: 'free', label: 'No se cobra' },
                ]}
              />
              {priceMode === 'priced' && (
                <MoneyInput
                  id="edit-booking-price"
                  aria-label="Precio del turno"
                  valueCents={priceCents}
                  onValueChange={setPriceCents}
                  minCents={0}
                  disabled={isPending}
                />
              )}
              {isAbonadoSession && (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
                  Turno fijo: este precio es sólo para esta fecha, no cambia el contrato.
                </p>
              )}
            </div>

            {error && (
              <p role="alert" className="text-xs text-red-700 dark:text-red-300">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                className="h-11 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60 md:h-10"
              >
                Volver
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 md:h-10"
              >
                {isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}

        {!loading && detailError && !detail && (
          <p role="alert" className="text-xs text-red-700 dark:text-red-300">
            {detailError}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
