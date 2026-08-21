'use client'

import { useEffect, useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { GridBooking } from '@/lib/booking/grid-cells'

/**
 * Mover un turno a otra cancha / día / horario sin cancelarlo (Fase 3,
 * criterio de salida #2).
 *
 * El precio se RECALCULA a la franja destino — decisión de producto: el precio
 * pertenece a la franja, no a la reserva. Por eso el diálogo muestra el precio
 * de cada hueco y avisa explícitamente cuando el cambio mueve la plata: enterarse
 * después, en la caja, sería peor que no poder mover el turno.
 *
 * Las Server Actions llegan POR PROP (ver el comentario de BookingSlotPanel).
 */

export type RescheduleSlotOption = {
  timeStart: string
  timeEnd: string
  price: number | null
  available: boolean
}

export type ListRescheduleSlots = (input: {
  courtId: string
  date: string
}) => Promise<
  | { success: true; slots: RescheduleSlotOption[]; minDate: string; maxDate: string }
  | { success: false; error: string }
>

export type RescheduleBooking = (input: {
  bookingId: string
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
}) => Promise<{
  success: boolean
  error?: string
  priceChanged?: boolean
  /** El turno como quedó grabado: el precio del toast sale de acá, no del listado. */
  booking?: { priceSnapshot: number }
}>

type Props = {
  /**
   * El caller monta este diálogo SOLO cuando está abierto (mismo patrón que
   * BookingFormModal en la grilla): el estado arranca limpio en cada apertura.
   */
  open: boolean
  onOpenChange: (open: boolean) => void
  booking: GridBooking
  courts: Array<{ id: string; name: string; status?: 'online' | 'offline' }>
  listSlotsAction: ListRescheduleSlots
  rescheduleAction: RescheduleBooking
  onSuccess: () => void
}

export function BookingRescheduleDialog({
  open,
  onOpenChange,
  booking,
  courts,
  listSlotsAction,
  rescheduleAction,
  onSuccess,
}: Props) {
  const [courtId, setCourtId] = useState(booking.courtId)
  const [date, setDate] = useState(booking.date)
  const [slots, setSlots] = useState<RescheduleSlotOption[] | null>(null)
  const [range, setRange] = useState<{ minDate: string; maxDate: string } | null>(null)
  const [selected, setSelected] = useState<RescheduleSlotOption | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Se incrementa para forzar una relectura sin cambiar cancha ni día (el
  // retry después de un SlotTakenError).
  const [reloadToken, setReloadToken] = useState(0)
  const [isPending, startTransition] = useTransition()

  // Una cancha pausada no toma turnos: getAvailableSlots ya devuelve [] para
  // ella, así que ofrecerla sólo produciría una lista vacía sin explicación.
  const selectableCourts = courts.filter((c) => c.status !== 'offline')

  // `loading` se DERIVA de "todavía no llegó nada" en vez de ser un estado que
  // el efecto prende: setState síncrono dentro de un efecto dispara renders en
  // cascada (react-hooks/set-state-in-effect). Quien invalida la lista es el
  // handler del usuario, que sí puede setear estado.
  const loading = slots === null

  useEffect(() => {
    // `alive` no es ceremonia: cambiar de cancha rápido deja dos requests en
    // vuelo y la primera puede contestar última. Sin el guard, la lista
    // terminaría mostrando los horarios de la cancha anterior.
    let alive = true
    void (async () => {
      try {
        const res = await listSlotsAction({ courtId, date })
        if (!alive) return
        if (!res.success) {
          setSlots([])
          setError(res.error)
          return
        }
        setSlots(res.slots)
        setRange({ minDate: res.minDate, maxDate: res.maxDate })
      } catch (err) {
        Sentry.captureException(err)
        if (!alive) return
        setSlots([])
        setError('No pudimos cargar los horarios. Revisá tu conexión.')
      }
    })()
    return () => {
      alive = false
    }
  }, [courtId, date, reloadToken, listSlotsAction])

  /**
   * Cambiar cancha o día invalida la lista y la selección: vuelve a "cargando".
   *
   * Dos setters explícitos en vez de un helper que recibe un callback: la forma
   * `reset(() => setCourtId(v))` se lee —y react-doctor la lee— como un state
   * updater con efectos adentro (`no-impure-state-updater`). Acá no había
   * ningún updater, pero la ambigüedad no vale nada.
   */
  function invalidateSlots() {
    setSlots(null)
    setSelected(null)
    setError(null)
  }

  function changeCourt(next: string) {
    invalidateSlots()
    setCourtId(next)
  }

  function changeDate(next: string) {
    invalidateSlots()
    setDate(next)
  }

  function isCurrentSlot(s: RescheduleSlotOption): boolean {
    return courtId === booking.courtId && date === booking.date && s.timeStart === booking.timeStart
  }

  function submit() {
    if (!selected) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await rescheduleAction({
          bookingId: booking.id,
          courtId,
          date,
          timeStart: selected.timeStart,
          timeEnd: selected.timeEnd,
        })
        if (!res.success) {
          // El hueco pudo haberse ocupado entre el listado y el submit: releer
          // deja la lista mostrando la verdad en vez del estado que falló.
          setSelected(null)
          setSlots(null)
          setError(res.error ?? 'No se pudo mover el turno.')
          setReloadToken((t) => t + 1)
          return
        }
        toast({
          title: 'Turno reprogramado',
          // El precio sale del turno GRABADO, no de `selected.price` (que se
          // leyó al listar los huecos): si la tarifa de la cancha cambió en el
          // medio, el toast estaría anunciando un precio que no es el que quedó.
          description: res.priceChanged
            ? `El precio cambió a ${formatArs(res.booking?.priceSnapshot ?? selected.price ?? booking.priceSnapshot)}.`
            : undefined,
          variant: 'success',
        })
        onSuccess()
      } catch (err) {
        Sentry.captureException(err)
        setError('No se pudo mover el turno. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  /**
   * Una sesión de abonado conserva SIEMPRE el precio del contrato: el backend
   * ignora la tarifa de la franja destino (`booking.reschedule.ts`, rama
   * `type === 'fixed'`). Mostrar el precio por franja acá sería mostrar un
   * número que el servidor no va a usar.
   */
  const keepsContractPrice = booking.type === 'fixed'
  const priceDelta =
    !keepsContractPrice && selected && selected.price != null
      ? selected.price - booking.priceSnapshot
      : 0

  return (
    <Dialog open={open} onOpenChange={(v) => !isPending && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reprogramar turno</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Ahora: {booking.timeStart}–{booking.timeEnd} del {booking.date} ·{' '}
          {formatArs(booking.priceSnapshot)}
        </p>

        {keepsContractPrice && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
            Turno fijo: se mantiene el precio del contrato ({formatArs(booking.priceSnapshot)}) sin
            importar el horario al que lo muevas.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="reschedule-court">Cancha</Label>
            <select
              id="reschedule-court"
              value={courtId}
              onChange={(e) => changeCourt(e.target.value)}
              disabled={isPending}
              className="h-11 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:h-10"
            >
              {selectableCourts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reschedule-date">Día</Label>
            <input
              id="reschedule-date"
              type="date"
              value={date}
              min={range?.minDate}
              max={range?.maxDate}
              onChange={(e) => changeDate(e.target.value)}
              disabled={isPending}
              className="h-11 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:h-10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">Horarios libres</p>
          {loading && <p className="text-sm text-muted-foreground">Buscando horarios…</p>}
          {!loading && slots?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay horarios disponibles en esa cancha ese día.
            </p>
          )}
          {!loading && slots && slots.length > 0 && (
            <div
              role="radiogroup"
              aria-label="Horarios disponibles"
              className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4"
            >
              {slots.map((s) => {
                const current = isCurrentSlot(s)
                const isSelected = selected?.timeStart === s.timeStart
                return (
                  <button
                    key={s.timeStart}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={!s.available || isPending}
                    onClick={() => setSelected(s)}
                    className={cn(
                      'flex min-h-11 flex-col items-center justify-center rounded-md border px-1 py-1.5 text-xs font-semibold tabular-nums transition-colors md:min-h-10',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground hover:bg-accent',
                      !s.available && 'cursor-not-allowed opacity-50 hover:bg-card',
                    )}
                  >
                    <span>{s.timeStart}</span>
                    {/* `opacity-80` SOLO en la ficha sin elegir. Sobre
                        `bg-primary` el `text-primary-foreground` al 80% da
                        4.16:1 y AA pide 4.5 — misma clase de bug que el `/80`
                        de admin-sidebar.tsx. Sin elegir es texto casi negro
                        sobre `bg-card`, donde el 80% sobra. */}
                    <span className={cn('text-[10px] font-medium', !isSelected && 'opacity-80')}>
                      {current
                        ? 'Actual'
                        : keepsContractPrice
                          ? formatArs(booking.priceSnapshot)
                          : s.price != null
                            ? formatArs(s.price)
                            : 'Sin precio'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {selected && priceDelta !== 0 && (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            El precio pasa de {formatArs(booking.priceSnapshot)} a{' '}
            {formatArs(selected.price ?? booking.priceSnapshot)} ({priceDelta > 0 ? '+' : ''}
            {formatArs(priceDelta)}): esa franja tiene otra tarifa.
          </p>
        )}

        {/* red-700/red-300 (idiom de `status-tone.ts`), no `text-destructive`: el
            token es red-600 en los DOS temas y sobre la superficie oscura da 3.87:1. */}
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
            type="button"
            onClick={submit}
            disabled={!selected || isPending}
            className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 md:h-10"
          >
            {isPending ? 'Moviendo…' : 'Mover turno'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
