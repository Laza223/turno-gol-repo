'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { AlertCircle, SlidersHorizontal } from 'lucide-react'
import { MoneyInput } from '@/components/ui/money-input'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { calcDepositCents } from '@/lib/booking/pricing'
import { TONE_TEXT } from '@/lib/status-tone'
import { track } from '@/shared/observability/breadcrumbs'
import type { BookingRow } from '@/modules/bookings/booking.types'
import type { PlayerSearchResult } from '@/modules/players/player-search.service'
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
 * Dos campos a la vista: **quién** y **seña**. El precio NO es un campo — se
 * muestra ya resuelto. Se calcula en el cliente con la MISMA función que usa el
 * server (`@/lib/booking/pricing`), así que no hay round-trip antes de mostrarlo
 * ni forma de que lo mostrado difiera de lo que se graba.
 *
 * Las Server Actions llegan por prop (ver BookingFormModal).
 */

type Slot = {
  courtId: string
  courtName: string
  date: string
  timeStart: string
  timeEnd: string
}

export type QuickBookingConfig = {
  action: CreateBookingAction
  checkAvailabilityAction?: CheckSlotAvailabilityAction
  searchPlayersAction?: SearchBookingPlayersAction
  /** `settings.deposit_percentage` del complejo. Sugiere el monto de la seña. */
  depositPercentage: number
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

type DepositMethod = 'cash' | 'transfer' | 'mercadopago'

const DEPOSIT_METHODS: Array<{ value: DepositMethod; label: string }> = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'mercadopago', label: 'MP' },
]

export function QuickBookingForm({
  slot,
  price,
  action,
  checkAvailabilityAction,
  searchPlayersAction,
  depositPercentage,
  onSuccess,
  onMoreOptions,
  onClose,
}: Props) {
  const [name, setName] = useState('')
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [results, setResults] = useState<PlayerSearchResult[]>([])
  const [depositMethod, setDepositMethod] = useState<DepositMethod | null>(null)
  const [depositCents, setDepositCents] = useState<number | null>(null)
  const [taken, setTaken] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  }, [])

  /**
   * Chequeo optimista al abrir. Es fail-open (devuelve `available: true` ante
   * cualquier fallo propio), así que un `false` es señal POSITIVA de que el
   * turno se ocupó: ahí sí se bloquea el submit. Sin mostrarlo, la carrera de
   * doble reserva quedaría solo en el exclusion constraint de la DB y el admin
   * vería un error críptico recién al confirmar.
   */
  useEffect(() => {
    if (!checkAvailabilityAction) return
    let alive = true
    void (async () => {
      try {
        const res = await checkAvailabilityAction({
          courtId: slot.courtId,
          date: slot.date,
          timeStart: slot.timeStart,
        })
        // Guard de cancelación ANTES de tocar estado: si el efecto se re-corrió
        // (cambió el slot), esta respuesta ya es vieja y escribirla pisaría la
        // del slot nuevo.
        if (!alive) return
        if (!res.available) setTaken(true)
      } catch {
        /* fail-open: un fallo del chequeo nunca bloquea el alta */
      }
    })()
    return () => {
      alive = false
    }
  }, [checkAvailabilityAction, slot.courtId, slot.date, slot.timeStart])

  function handleNameChange(next: string) {
    setName(next)
    setPlayerId(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = next.trim()
    if (!searchPlayersAction || q.length < 2) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(() => {
      void (async () => {
        const res = await searchPlayersAction({ query: q })
        if (res.success) setResults(res.players)
      })()
    }, 300)
  }

  function pickPlayer(player: PlayerSearchResult) {
    setPlayerId(player.id)
    setName(player.name)
    setResults([])
  }

  /** Sugerencia de seña, o `null` si el complejo no configuró porcentaje. */
  const suggestedDeposit = (() => {
    if (price == null) return null
    const cents = calcDepositCents(price, depositPercentage)
    return cents > 0 ? cents : null
  })()

  function toggleDeposit(method: DepositMethod) {
    if (depositMethod === method) {
      setDepositMethod(null)
      setDepositCents(null)
      return
    }
    setDepositMethod(method)
    // Pre-cargado con el % del complejo — pero SOLO si da algo mayor a $0.
    // Un complejo con `deposit_percentage: 0` (no pide seña online, config
    // válida y la del seed) dejaba el monto en $0, y el submit lo rechazaba:
    // el atajo se convertía en un callejón sin salida. Con la sugerencia vacía,
    // el admin tipea el monto y sigue.
    setDepositCents(suggestedDeposit)
  }

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
    if (depositMethod && (depositCents == null || depositCents <= 0)) {
      setError('La seña tiene que ser mayor a $0.')
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
          description: `${slot.courtName} · ${slot.timeStart}–${slot.timeEnd}`,
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

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium">
          Seña
          {suggestedDeposit != null && (
            <span className="text-muted-foreground"> · sugerida {formatArs(suggestedDeposit)}</span>
          )}
        </legend>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setDepositMethod(null)
              setDepositCents(null)
            }}
            aria-pressed={depositMethod === null}
            disabled={isPending || taken}
            className={cn(
              'h-10 rounded-md border text-xs font-semibold transition-colors',
              depositMethod === null
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card hover:bg-accent',
            )}
          >
            Sin seña
          </button>
          {DEPOSIT_METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => toggleDeposit(m.value)}
              aria-pressed={depositMethod === m.value}
              disabled={isPending || taken}
              className={cn(
                'h-10 rounded-md border text-xs font-semibold transition-colors',
                depositMethod === m.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card hover:bg-accent',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {depositMethod && (
          <MoneyInput
            aria-label="Monto de la seña"
            valueCents={depositCents}
            onValueChange={setDepositCents}
            disabled={isPending}
            minCents={0}
            showWords={false}
          />
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-xs text-destructive">
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
