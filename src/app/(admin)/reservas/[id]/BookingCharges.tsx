'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import type { BookingChargeRow } from '../queries'
import type { AddBookingChargeInput, BookingChargeActionResult } from '../actions'

type Props = {
  bookingId: string
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
  charges: BookingChargeRow[]
  chargesTotal: number
  /**
   * Server Action por PROP, no por import (ver comentario homólogo en
   * ReservasPolicyForm.tsx): '../actions' es `'use server'` y arrastra
   * node:async_hooks, que rompe Storybook.
   */
  addBookingChargeAction: (input: AddBookingChargeInput) => Promise<BookingChargeActionResult>
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mercadopago: 'MercadoPago',
  other: 'Otro',
}

const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  pending: 'pendiente',
  refunded: 'reembolsada',
  not_required: 'no requerida',
}

export default function BookingCharges({
  bookingId,
  priceSnapshot,
  depositAmount,
  depositStatus,
  charges,
  chargesTotal,
  addBookingChargeAction,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [amountPesos, setAmountPesos] = useState('')
  const [method, setMethod] = useState<'cash' | 'transfer' | 'mercadopago' | 'other'>('cash')

  const { depositCounted, totalPaid, pending: pendingAmount } = useMemo(
    () =>
      summarizeBookingCharges({
        priceSnapshot,
        depositAmount,
        depositStatus,
        chargesTotal,
      }),
    [priceSnapshot, depositAmount, depositStatus, chargesTotal],
  )

  function openForm() {
    setError(null)
    // Prefill con el saldo pendiente: el caso típico es cobrar todo lo que falta.
    setAmountPesos(pendingAmount > 0 ? String(Math.round(pendingAmount / 100)) : '')
    setMethod('cash')
    setOpen(true)
  }

  function onSubmit() {
    setError(null)
    const pesos = Number(amountPesos)
    if (!Number.isFinite(pesos) || pesos <= 0) {
      setError('Ingresá un monto mayor a 0.')
      return
    }
    const amount = Math.round(pesos * 100)
    const clientIdempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined

    startTransition(async () => {
      const res = await addBookingChargeAction({ bookingId, amount, method, clientIdempotencyKey })
      if (res.success) {
        toast({ title: 'Cobro registrado', variant: 'success' })
        setOpen(false)
        setAmountPesos('')
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  const isPaidInFull = pendingAmount === 0

  return (
    <section className="card-premium rounded-xl p-6">
      <h2 className="text-sm font-semibold text-foreground">Cobros de turno</h2>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Precio del turno</dt>
          <dd className="font-semibold text-foreground">{formatArs(priceSnapshot)}</dd>
        </div>
        {depositAmount > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              Seña{' '}
              {depositCounted > 0 ? (
                // emerald-600 daba 3.76:1 sobre la card blanca. El idiom del repo para
                // esta clase de texto es -800 en light (ver status-visual.tsx): 7.68:1.
                // El valor de dark (-400) sí pasa sobre superficie oscura y no se toca.
                <span className="text-emerald-800 dark:text-emerald-400">✓ pagada</span>
              ) : (
                <span className="text-muted-foreground">
                  ({DEPOSIT_STATUS_LABELS[depositStatus] ?? depositStatus})
                </span>
              )}
            </dt>
            <dd className="text-foreground">{formatArs(depositAmount)}</dd>
          </div>
        )}
        {charges.map((c) => (
          <div key={c.id} className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              Cobro · {METHOD_LABELS[c.method] ?? c.method}
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
            // -600 no llegaba a AA sobre la card blanca (emerald 3.76:1, amber 3.18:1).
            // -800 es el idiom del repo para light (status-visual.tsx): 7.68:1 y 6.36:1.
            className={`font-semibold ${isPaidInFull ? 'text-emerald-800 dark:text-emerald-400' : 'text-amber-800 dark:text-amber-400'}`}
          >
            {isPaidInFull ? 'Pagado completo' : formatArs(pendingAmount)}
          </dd>
        </div>
      </dl>

      {!open ? (
        <button
          type="button"
          onClick={openForm}
          className="mt-4 h-11 md:h-9 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-card px-4 text-sm font-semibold text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
        >
          + Agregar cobro
        </button>
      ) : (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-muted/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 space-y-1">
              <label htmlFor="charge-amount" className="text-xs font-medium text-foreground">
                Monto (ARS)
              </label>
              <input
                id="charge-amount"
                type="number"
                inputMode="numeric"
                min={1}
                value={amountPesos}
                onChange={(e) => setAmountPesos(e.target.value)}
                className="h-11 md:h-9 w-full rounded-md border border-border px-3 text-sm focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label htmlFor="charge-method" className="text-xs font-medium text-foreground">
                Medio de pago
              </label>
              <select
                id="charge-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
                className="h-11 md:h-9 w-full rounded-md border border-border px-3 text-sm focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="mercadopago">MercadoPago</option>
                <option value="other">Otro</option>
              </select>
            </div>
          </div>
          {error && (
            // red-600 sobre el panel `bg-muted/40` (#ebeff5) daba 4.18:1. red-700 es el
            // idiom de light del repo (status-visual.tsx) y pasa AA.
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={onSubmit}
              className="h-11 md:h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              Registrar cobro
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="h-11 md:h-9 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
