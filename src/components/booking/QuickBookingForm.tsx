'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { AlertCircle, SlidersHorizontal } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TONE_TEXT } from '@/lib/status-tone'
import { track } from '@/shared/observability/breadcrumbs'
import { DepositFieldset, type DepositChoice } from './quick-form/DepositFieldset'
import { usePlayerSearch } from './quick-form/use-player-search'
import { depositAfterCloseNote } from './deposit-after-close'
import { useSlotAvailability } from './quick-form/use-slot-availability'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { Slot } from './quick-form/constants'
import type {
  CheckSlotAvailabilityAction,
  CreateBookingAction,
  SearchBookingPlayersAction,
} from './BookingFormModal'

/**
 * Alta rápida desde la grilla — Fase 3, criterio de salida #3: **≤3 campos
 * visibles, precio pre-calculado, Enter confirma**.
 *
 * El modal completo sigue existiendo intacto detrás de "Más opciones": bloqueos,
 * precio a mano, teléfono, notas, duración. Acá vive el caso del 90% (alguien
 * llama y pide la cancha), y el criterio #4 lo mide en segundos.
 *
 * Dos campos a la vista: **quién** y **qué se cobró**. El precio NO es un campo
 * — se muestra ya resuelto. Se calcula en el cliente con la MISMA función que
 * usa el server (`@/lib/booking/pricing`), así que no hay round-trip antes de
 * mostrarlo ni forma de que lo mostrado difiera de lo que se graba.
 *
 * Lo cobrado es de respuesta OBLIGATORIA (y sin preselección): el turno cargado
 * a mano no tiene ningún hecho de plata detrás salvo lo que afirme quien está en
 * el mostrador. "No cobré" es una respuesta válida y el caso normal del complejo
 * que cobra al terminar de jugar; lo que ya no existe es crear el turno sin
 * decirlo.
 *
 * Las Server Actions llegan por prop (ver BookingFormModal). Piezas propias en
 * `quick-form/`: constantes, búsqueda de jugador, chequeo optimista de
 * disponibilidad y el fieldset de lo cobrado — este archivo queda como orquestador.
 */

type QuickBookingConfig = {
  action: CreateBookingAction
  checkAvailabilityAction?: CheckSlotAvailabilityAction
  searchPlayersAction?: SearchBookingPlayersAction
  onSuccess: (booking: BookingRow) => void
  /** Abre el `BookingFormModal` completo con este mismo slot. */
  onMoreOptions: (slot: Slot) => void
}

type Props = QuickBookingConfig & {
  slot: Slot
  /** Precio de la franja, en centavos. `null` = sin regla de precio configurada. */
  price: number | null
  onClose: () => void
}

export function QuickBookingForm({
  slot,
  price,
  action,
  checkAvailabilityAction,
  searchPlayersAction,
  onSuccess,
  onMoreOptions,
  onClose,
}: Props) {
  const { name, playerId, results, handleNameChange, pickPlayer, debounceRef } = usePlayerSearch({
    searchPlayersAction,
  })
  const taken = useSlotAvailability({ checkAvailabilityAction, slot })
  // `null` = todavía no contestó. El submit lo exige: ver DepositFieldset.
  const [depositChoice, setDepositChoice] = useState<DepositChoice | null>(null)
  const [depositCents, setDepositCents] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Cronómetro del criterio de salida #4 ("alta ≤10 s"). Se arranca en el
  // efecto de montaje, no en el cuerpo: `Date.now()` en render es impuro.
  const openedAtRef = useRef<number | null>(null)
  // Se pone en true cuando el popover se cierra por una razón conocida
  // (confirmó / se fue al modal): lo que quede sin marcar es abandono.
  const resolvedRef = useRef(false)

  function elapsed(): number {
    return openedAtRef.current === null ? 0 : Date.now() - openedAtRef.current
  }

  useEffect(() => {
    openedAtRef.current = Date.now()
    track.grid('quick_create.opened', {})
    const debounce = debounceRef
    const resolved = resolvedRef
    const openedAt = openedAtRef
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
      if (!resolved.current) {
        track.grid('quick_create.abandoned', {
          durationMs: openedAt.current === null ? 0 : Date.now() - openedAt.current,
        })
      }
    }
    // Se monta y desmonta una vez por apertura (el caller lo monta al abrir).
    // debounceRef es estable (viene de un useRef en usePlayerSearch): declararlo
    // acá no reintroduce re-corridas, solo conforma a exhaustive-deps ahora que
    // el ref ya no nace en este mismo scope.
  }, [debounceRef])

  function goToModal() {
    resolvedRef.current = true
    track.grid('quick_create.more_options', { durationMs: elapsed() })
    onMoreOptions(slot)
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    // Enter en cualquier campo dispara el submit del form: es el criterio #3.
    e.preventDefault()
    if (isPending || taken) return
    setError(null)

    const trimmed = name.trim()
    if (!trimmed) {
      setError('Poné a nombre de quién va el turno.')
      return
    }
    if (depositChoice === null) {
      setError('Decí si cobraste algo por este turno.')
      return
    }
    const depositMethod = depositChoice === 'none' ? null : depositChoice
    if (depositMethod && (depositCents == null || depositCents <= 0)) {
      setError('El monto cobrado tiene que ser mayor a $0.')
      return
    }

    const data = {
      courtId: slot.courtId,
      date: slot.date,
      timeStart: slot.timeStart,
      timeEnd: slot.timeEnd,
      type: 'spontaneous' as const,
      // playerId y guestName son mutuamente excluyentes en
      // createManualBookingSchema: con jugador elegido, el nombre libre no viaja.
      ...(playerId ? { playerId } : { guestName: trimmed }),
      ...(depositMethod && depositCents
        ? { depositMethod, depositAmount: depositCents, depositStatus: 'paid' as const }
        : {}),
    }

    startTransition(async () => {
      try {
        const result = await action(data)
        if (!result.success) {
          setError(result.error)
          return
        }
        resolvedRef.current = true
        track.grid('quick_create.confirmed', {
          durationMs: elapsed(),
          withPlayer: playerId != null,
          withDeposit: depositMethod != null,
        })
        toast({
          title: 'Reserva creada',
          // Ver `depositAfterCloseNote`: con la caja del día ya cerrada la seña
          // entra como ajuste y el encargado no lo ve en ningún otro lado.
          description: depositAfterCloseNote(
            `${slot.courtName} · ${slot.timeStart}–${slot.timeEnd}`,
            result.depositAfterClose,
          ),
          variant: 'success',
        })
        onSuccess(result.booking)
      } catch (err) {
        Sentry.captureException(err)
        setError('No pudimos crear la reserva. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  return (
    <form onSubmit={submit} className="flex w-[19rem] flex-col gap-3">
      <header className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{slot.courtName}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {slot.timeStart}–{slot.timeEnd}
          </p>
        </div>
        {/* El precio se MUESTRA, no se pide: editarlo vive en "Más opciones". */}
        <p className="shrink-0 text-right">
          {/* emerald-800, no 700: sobre el fondo del popover el 700 da 4.41:1 y
              AA pide 4.5. Es el mismo nivel que fija TONE_TEXT.success. */}
          <span className={cn('block text-base font-bold tabular-nums', TONE_TEXT.success)}>
            {price != null ? formatArs(price) : 'Sin precio'}
          </span>
          {price == null && (
            <span className="block text-[10px] text-muted-foreground">Falta la tarifa</span>
          )}
        </p>
      </header>

      {taken && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-200"
        >
          <AlertCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Este turno acaba de ser tomado. Actualizá la grilla.
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="quick-name" className="text-xs font-medium">
          ¿A nombre de quién?
        </label>
        <input
          id="quick-name"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          disabled={isPending || taken}
          autoFocus
          autoComplete="off"
          placeholder="Nombre o buscá un jugador"
          className="h-11 w-full rounded-md border border-border bg-card px-3 text-base focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:h-10 md:text-sm"
        />
        {results.length > 0 && (
          <ul className="max-h-36 overflow-y-auto rounded-md border border-border bg-popover">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => pickPlayer(p)}
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {playerId && (
          <p className={cn('text-[11px]', TONE_TEXT.success)}>
            Jugador registrado: queda vinculado a su ficha.
          </p>
        )}
      </div>

      <DepositFieldset
        depositChoice={depositChoice}
        depositCents={depositCents}
        onDepositChoiceChange={setDepositChoice}
        onDepositCentsChange={setDepositCents}
        isPending={isPending}
        taken={taken}
      />

      {/* `TONE_TEXT.destructive` (red-700/red-300), no `text-destructive`: el
          red-600 del token da 3.86:1 sobre la superficie del popover y no
          llega a AA. Se veía recién ahora porque ninguna story entraba al
          estado de error, así que axe nunca lo medía — mismo idiom que
          `BookingFormModal` y `error-state.tsx`. */}
      {error && (
        <p role="alert" className={cn('text-xs', TONE_TEXT.destructive)}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || taken}
        className="h-11 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 md:h-10"
      >
        {isPending ? 'Creando…' : 'Confirmar reserva'}
      </button>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goToModal}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <SlidersHorizontal aria-hidden className="h-3.5 w-3.5" />
          Más opciones
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
