'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { METHOD_LABELS } from '@/lib/payment-method'
import {
  SplitPaymentFields,
  newChargeLine,
  type ChargeLine as FieldLine,
} from '@/components/admin/SplitPaymentFields'
import { resolveDepositDisplayStatus, type RefundState } from '../deposit-display'
import type { BookingChargeRow } from '../queries'
import type { AddBookingChargeInput, BookingChargeActionResult } from '../actions'

type Props = {
  bookingId: string
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
  /** Ver `deposit-display.ts`: `depositStatus` se congela al cancelar, así que `payments` manda. */
  refundState?: RefundState
  charges: BookingChargeRow[]
  chargesTotal: number
  /**
   * Server Action por PROP, no por import (ver comentario homólogo en
   * ReservasPolicyForm.tsx): '../actions' es `'use server'` y arrastra
   * node:async_hooks, que rompe Storybook.
   */
  addBookingChargeAction: (input: AddBookingChargeInput) => Promise<BookingChargeActionResult>
}

type ChargeLine = AddBookingChargeInput['charges'][number]

/** El tope del schema de `addBookingChargeAction` (`.min(1).max(5)`). */
const MAX_LINES = 5

/** Un cobro que salió y cuya respuesta no llegó: no se sabe si entró. */
type UnconfirmedCharge = {
  key: string
  charges: ChargeLine[]
  total: number
  toastTitle: string
  toastDescription?: string
}

const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  pending: 'pendiente',
  // La plata todavía no se movió: el complejo la debe. Ver `deposit-display.ts`.
  refund_pending: 'a devolver',
  refunded: 'devuelta',
  not_required: 'no requerida',
}

export default function BookingCharges({
  bookingId,
  priceSnapshot,
  depositAmount,
  depositStatus,
  refundState,
  charges,
  chargesTotal,
  addBookingChargeAction,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<FieldLine[]>([])
  /**
   * La key vive lo que vive UN intento de cobro. Antes se armaba una nueva en
   * cada toque de "Registrar cobro": si la request se cortaba por la red pero el
   * cobro entraba, el reintento viajaba con otra key y el servidor lo insertaba
   * de nuevo. Ahora se conserva hasta que el servidor contesta y, mientras no se
   * sepa si el cobro entró, lo único que se puede mandar es ESE cobro — si se
   * pudiera cargar otro con la misma key, un cobro idéntico se tomaría por
   * reintento (el mismo problema que el panel de la grilla).
   */
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [unconfirmed, setUnconfirmed] = useState<UnconfirmedCharge | null>(null)
  const retryCharge = unconfirmed?.key === idempotencyKey ? unconfirmed : null

  const {
    depositCounted,
    totalPaid,
    pending: pendingAmount,
  } = useMemo(
    () =>
      summarizeBookingCharges({
        priceSnapshot,
        depositAmount,
        depositStatus,
        chargesTotal,
      }),
    [priceSnapshot, depositAmount, depositStatus, chargesTotal],
  )
  const isPaidInFull = pendingAmount === 0
  // Solo la ETIQUETA. `summarizeBookingCharges` de arriba sigue recibiendo el
  // `depositStatus` crudo: los totales son plata, no texto.
  const depositDisplayStatus = resolveDepositDisplayStatus(depositStatus, refundState)

  function openForm() {
    setError(null)
    // Precargado con lo que falta, en efectivo: se corrige para abajo, no se
    // escribe de cero (mismo criterio que el panel del turno en la grilla).
    setLines([newChargeLine(pendingAmount > 0 ? pendingAmount : null, 'cash')])
    setOpen(true)
  }

  function onSubmit() {
    setError(null)
    const attempt: ChargeLine[] = []
    for (const l of lines) {
      if (l.amountCents == null || l.amountCents <= 0) {
        setError('Todos los cobros deben tener un monto mayor a $0.')
        return
      }
      attempt.push({ amount: l.amountCents, method: l.method })
    }
    if (attempt.length === 0) {
      setError('Ingresá al menos una línea de cobro.')
      return
    }
    const total = attempt.reduce((s, c) => s + c.amount, 0)
    if (total > pendingAmount) {
      setError(`El cobro (${formatArs(total)}) supera lo pendiente (${formatArs(pendingAmount)}).`)
      return
    }
    // Un solo llamado, atómico (addBookingChargeAction inserta las N líneas en
    // la MISMA transacción): un fallo a mitad de camino no deja la plata de una
    // línea adentro sin la otra.
    runCharge({
      key: idempotencyKey,
      charges: attempt,
      total,
      toastTitle: attempt.length > 1 ? 'Cobro dividido registrado' : 'Cobro registrado',
      toastDescription:
        attempt.length > 1
          ? attempt.map((c) => `${formatArs(c.amount)} (${METHOD_LABELS[c.method]})`).join(' + ')
          : undefined,
    })
  }

  function runCharge(attempt: UnconfirmedCharge) {
    startTransition(async () => {
      try {
        const res = await addBookingChargeAction({
          bookingId,
          charges: attempt.charges,
          clientIdempotencyKey: attempt.key,
        })
        // El servidor contestó: el intento quedó resuelto (entró, o no dejó nada
        // escrito), así que el próximo cobro va con otra key.
        setUnconfirmed(null)
        setIdempotencyKey(crypto.randomUUID())
        if (!res.success) {
          setError(res.error)
          return
        }
        toast({
          title: attempt.toastTitle,
          description: attempt.toastDescription,
          variant: 'success',
        })
        setOpen(false)
        setLines([])
        router.refresh()
      } catch (err) {
        Sentry.captureException(err)
        setError(null)
        setUnconfirmed(attempt)
      }
    })
  }

  /** Reenvía el cobro que quedó sin confirmar: mismas líneas, misma key. */
  function retryUnconfirmedCharge() {
    if (!retryCharge) return
    setError(null)
    runCharge(retryCharge)
  }

  return (
    // Sin recuadro: la página ya separa este bloque de la ficha por columna (en
    // escritorio) o por espacio (en el teléfono). La caja con borde y sombra
    // era la que "hacía bordes a los costados" (pedido del dueño, 2026-09-17).
    <section aria-labelledby="cobros-de-turno">
      <h2 id="cobros-de-turno" className="text-sm font-semibold text-foreground">
        Cobros de turno
      </h2>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Precio del turno</dt>
          <dd className="font-semibold text-foreground">{formatArs(priceSnapshot)}</dd>
        </div>
        {depositAmount > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              Seña{' '}
              {depositCounted > 0 ? (
                <span className="text-emerald-800 dark:text-emerald-400">✓ pagada</span>
              ) : (
                <span className="text-muted-foreground">
                  ({DEPOSIT_STATUS_LABELS[depositDisplayStatus] ?? depositDisplayStatus})
                </span>
              )}
            </dt>
            <dd className="text-foreground">{formatArs(depositAmount)}</dd>
          </div>
        )}
        {charges.map((c, i) => (
          <div key={c.id} className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              {/* Cobro por equipo: cuando el turno se cobró en DOS veces, cada
                  fila dice de qué equipo salió. Con una sola, o con tres o más,
                  el rótulo mentiría — ahí vuelve a decir "Cobro" a secas. */}
              {charges.length === 2 ? `Equipo ${i + 1}` : 'Cobro'} ·{' '}
              {(METHOD_LABELS as Record<string, string>)[c.method] ?? c.method}
              {c.description && c.description !== 'Cobro de turno' ? ` · ${c.description}` : ''}
            </dt>
            <dd className="text-foreground">{formatArs(c.amount)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <dt className="font-medium text-foreground">Pagado</dt>
          <dd className="font-semibold text-foreground">{formatArs(totalPaid)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="font-medium text-foreground">Saldo pendiente</dt>
          <dd
            className={`text-lg font-semibold tabular-nums ${isPaidInFull ? 'text-emerald-800 dark:text-emerald-400' : 'text-amber-800 dark:text-amber-400'}`}
          >
            {isPaidInFull ? 'Pagado completo' : formatArs(pendingAmount)}
          </dd>
        </div>
      </dl>

      {!open ? (
        <button
          type="button"
          onClick={openForm}
          disabled={isPaidInFull}
          title={isPaidInFull ? 'Este turno ya está pagado por completo.' : undefined}
          // H078: este es el CTA que cobra la plata que se debe — es el
          // primario (sólido) de la vista, no "Marcar completada" (estado del
          // sistema). BONUS-62 / regla del dueño §8.4.
          className="mt-4 h-11 md:h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Agregar cobro
        </button>
      ) : (
        // 2026-09-17: el mismo control de cobro que el panel del turno de la
        // grilla, Caja y torneos. Antes esta era la última pantalla con uno
        // propio: pestañas "Pago único / Pago dividido (2 medios)", exactamente
        // dos líneas y tres <select> ocultos espejando Popovers.
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {/* Con un cobro sin confirmar no se toca nada: sólo se reintenta ese. */}
          <fieldset disabled={retryCharge !== null} className="min-w-0">
            <legend className="sr-only">Nuevo cobro</legend>
            <SplitPaymentFields
              lines={lines}
              onChange={(next) => {
                setError(null)
                setLines(next)
              }}
              maxLines={MAX_LINES}
              disabled={retryCharge !== null || pending}
              idPrefix="charge"
            />
          </fieldset>

          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          {retryCharge && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              Se cortó la conexión y no sabemos si ese cobro entró. Reintentalo antes de cargar
              otro: si ya había entrado, no se cobra dos veces.
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={retryCharge ? retryUnconfirmedCharge : onSubmit}
              className="h-11 md:h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
            >
              {retryCharge
                ? `Reintentar cobro de ${formatArs(retryCharge.total)}`
                : 'Registrar cobro'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="h-11 md:h-9 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
