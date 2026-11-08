'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { MoneyInput } from '@/components/ui/money-input'
import { choiceChipClass, SegmentedControl } from '@/components/ui/segmented-control'
import { chargeSplit } from '@/components/booking/slot-panel/charge-copy'
import type { SlotPanelActions } from '@/components/booking/slot-panel/actions'
import { useSlotCharges } from '@/components/booking/slot-panel/use-slot-charges'
import { hasBookingEnded, type GridBooking } from '@/lib/booking/grid-cells'
import { rowDisplayName } from '@/lib/dashboard/day-bookings'
import { formatArs } from '@/lib/format'
import { METHOD_LABELS, type MethodKey } from '@/lib/payment-method'
import { TONE_BADGE, TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

/** Los tres medios del mostrador, en el orden en que se usan. */
const CARD_METHODS = ['cash', 'mercadopago', 'transfer'] as const satisfies readonly MethodKey[]

/** Si el refresco no trae datos nuevos, la tarjeta se destraba sola pasado este tiempo. */
const UNLOCK_AFTER_MS = 10_000

const PRIMARY_BUTTON =
  'h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 md:h-10'

const SECONDARY_BUTTON =
  'h-11 w-full rounded-lg border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:h-10'

const LINK_BUTTON =
  'min-h-11 rounded-md px-1 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:min-h-9'

/**
 * Un turno para cobrar dentro de "Cobrar varios". Tiene su PROPIA instancia de
 * `useSlotCharges`: misma Server Action, misma idempotencia y mismo bloqueo de
 * fila que el modal de un turno, así que no hace falta una acción masiva y el
 * servidor revalida el saldo de cada cobro.
 *
 * El bloqueo durante el refresco es por tarjeta: después de cobrar esta, solo
 * ella espera los datos nuevos; las demás siguen disponibles. Se destraba
 * cuando llega el turno actualizado (otra referencia) o, por las dudas, a los
 * 10 s.
 */
export function ChargeCard({
  booking,
  courtName,
  capacity,
  nowMs,
  actions,
  onMutated,
  onOpenFull,
  onBusyChange,
  extraActions,
}: {
  booking: GridBooking
  courtName: string
  capacity: number | undefined
  nowMs: number
  actions: SlotPanelActions
  /** Se cobró: el dueño de la pantalla tiene que refrescar. */
  onMutated: () => void
  /** "Ver todo el turno": abre el modal completo de este turno. */
  onOpenFull: () => void
  /** Avisa si esta tarjeta tiene un cobro en curso (o esperando sus datos nuevos). */
  onBusyChange?: (bookingId: string, busy: boolean) => void
  /** Hueco para acciones extra bajo "Cobrar" (p. ej. "Dar por perdido"). */
  extraActions?: ReactNode
}) {
  const [method, setMethod] = useState<MethodKey>('cash')
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherCents, setOtherCents] = useState<number | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  // La plata del turno cuando se mandó el último cobro: mientras no cambie, los
  // datos nuevos todavía no llegaron. Se compara por plata y no por identidad del
  // objeto: la Grilla reemplaza todos los turnos en cada sondeo y soltaría el
  // bloqueo antes de tiempo.
  const [awaitingFor, setAwaitingFor] = useState<{ pending: number; totalPaid: number } | null>(
    null,
  )
  const awaiting =
    awaitingFor !== null &&
    awaitingFor.pending === (booking.pending ?? 0) &&
    awaitingFor.totalPaid === (booking.totalPaid ?? 0)
  // Tras un cobro exitoso la clave de idempotencia se rota: sin esto, un segundo
  // "Pagó uno" por el mismo monto y medio viajaría con la misma clave y el
  // servidor lo tomaría por reintento (aviso verde y plata que no entra).
  const [rotateKey, setRotateKey] = useState(false)

  useEffect(() => {
    if (!awaitingFor) return
    const id = setTimeout(() => setAwaitingFor(null), UNLOCK_AFTER_MS)
    return () => clearTimeout(id)
  }, [awaitingFor])

  const charges = useSlotCharges({
    booking,
    hasEnded: hasBookingEnded(booking, nowMs),
    actions,
    notifyMutated: () => {
      setAwaitingFor({ pending: booking.pending ?? 0, totalPaid: booking.totalPaid ?? 0 })
      setOtherOpen(false)
      setOtherCents(null)
      onMutated()
    },
    resetLastId: () => setRotateKey(true),
  })
  const { isPending, error, mode, pending, retryTotal } = charges
  if (rotateKey) {
    setRotateKey(false)
    charges.setIdempotencyKey(crypto.randomUUID())
  }

  // Avisa al diálogo que hay un cobro en curso: no se puede cerrar a la mitad.
  const busy = isPending || awaiting
  useEffect(() => {
    onBusyChange?.(booking.id, busy)
    return () => onBusyChange?.(booking.id, false)
  }, [booking.id, busy, onBusyChange])

  const name = rowDisplayName(booking)
  const header = (
    <div className="min-w-0">
      <p className="truncate text-xs tabular-nums text-muted-foreground">
        {courtName} · {booking.timeStart} a {booking.timeEnd}
      </p>
      <p className="truncate text-base font-semibold text-foreground">{name}</p>
    </div>
  )

  // Dado por perdido: sin saldo, pero nunca el verde de cobrado.
  const lostCents = booking.writtenOff ?? 0
  if (pending <= 0 && lostCents > 0) {
    return (
      <div
        role="group"
        aria-label={`${name}, ${courtName}`}
        className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4 dark:bg-muted/40"
      >
        {header}
        <p role="status" className="px-3 py-2.5 text-sm font-semibold text-muted-foreground">
          Perdido {formatArs(lostCents)}
        </p>
      </div>
    )
  }

  if (pending <= 0) {
    return (
      <div
        role="group"
        aria-label={`${name}, ${courtName}`}
        className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/5 p-4 dark:bg-success/10"
      >
        {header}
        <p
          role="status"
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold',
            TONE_BADGE.success,
          )}
        >
          <CheckCircle2 aria-hidden className="h-4 w-4" />
          Cobrado ✓
        </p>
      </div>
    )
  }

  const split = chargeSplit(booking, capacity)
  const locked = isPending || awaiting
  const blocked = locked || retryTotal !== null
  const shown = localError ?? error

  function submitOther() {
    if (otherCents === null || otherCents <= 0) {
      setLocalError('Ingresá cuánto se cobra.')
      return
    }
    if (otherCents > pending) {
      setLocalError(`Ese monto supera lo que falta (${formatArs(pending)}).`)
      return
    }
    setLocalError(null)
    charges.submitPartialCharge(otherCents, method)
  }

  return (
    <div
      role="group"
      aria-label={`${name}, ${courtName}`}
      aria-busy={locked || undefined}
      className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 dark:bg-destructive/10"
    >
      {header}

      <div>
        <p className={cn('font-display text-xl font-semibold tabular-nums', TONE_TEXT.destructive)}>
          Falta {formatArs(pending)}
        </p>
        {split.note && <p className="mt-0.5 text-xs text-muted-foreground">{split.note}</p>}
      </div>

      <SegmentedControl
        aria-label={`Cómo paga ${name}`}
        value={method}
        onValueChange={setMethod}
        disabled={blocked}
        options={CARD_METHODS.map((m) => ({ value: m, label: METHOD_LABELS[m] }))}
        className="flex gap-1.5"
        itemClassName={(active) => cn(choiceChipClass(active), 'flex-1 px-1')}
      />

      {mode !== null && !retryTotal && (
        <div className="flex flex-col gap-2">
          {split.canSplitShare && split.shareCents !== null && (
            <button
              type="button"
              disabled={blocked}
              onClick={() => {
                setLocalError(null)
                charges.submitPartialCharge(split.shareCents!, method)
              }}
              className={SECONDARY_BUTTON}
            >
              Pagó uno · {formatArs(split.shareCents)}
            </button>
          )}
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              setLocalError(null)
              charges.submitPartialCharge(pending, method)
            }}
            className={PRIMARY_BUTTON}
          >
            {isPending ? 'Cobrando…' : `Cobrar ${formatArs(pending)}`}
          </button>
        </div>
      )}

      {otherOpen && !retryTotal && (
        <div className="flex flex-col gap-2">
          <MoneyInput
            valueCents={otherCents}
            onValueChange={(cents) => {
              setLocalError(null)
              setOtherCents(cents)
            }}
            minCents={1}
            placeholder="Monto"
            disabled={blocked}
            aria-label={`Otro monto para ${name}`}
            className="h-11 md:h-10"
          />
          <button
            type="button"
            disabled={blocked || !otherCents}
            onClick={submitOther}
            className={SECONDARY_BUTTON}
          >
            Cobrar {otherCents ? formatArs(otherCents) : 'este monto'}
          </button>
        </div>
      )}

      {shown && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {shown}
        </p>
      )}

      {retryTotal !== null && (
        <>
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            Se cortó la conexión y no sabemos si ese cobro entró. Reintentalo antes de cobrar otra
            cosa: si ya había entrado, no se cobra dos veces.
          </p>
          <button
            type="button"
            disabled={locked}
            onClick={charges.retryUnconfirmedCharge}
            className={PRIMARY_BUTTON}
          >
            {isPending ? 'Cobrando…' : `Reintentar cobro de ${formatArs(retryTotal)}`}
          </button>
        </>
      )}

      {extraActions}

      <div className="flex flex-wrap items-center justify-between gap-x-3">
        {mode !== null && !retryTotal ? (
          <button
            type="button"
            disabled={blocked}
            aria-expanded={otherOpen}
            onClick={() => {
              setLocalError(null)
              setOtherOpen((v) => !v)
            }}
            className={LINK_BUTTON}
          >
            Otro monto
          </button>
        ) : (
          <span />
        )}
        <button type="button" disabled={locked} onClick={onOpenFull} className={LINK_BUTTON}>
          Ver todo el turno
        </button>
      </div>
    </div>
  )
}
