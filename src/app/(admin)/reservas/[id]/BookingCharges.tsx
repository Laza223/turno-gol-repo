'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addBookingChargeAction } from '../actions'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { toast } from '@/hooks/use-toast'
import type { BookingChargeRow } from '../queries'

type Props = {
  bookingId: string
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
  charges: BookingChargeRow[]
  chargesTotal: number
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mercadopago: 'MercadoPago',
  other: 'Otro',
}

function formatARS(centavos: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(centavos / 100)
}

export default function BookingCharges({
  bookingId,
  priceSnapshot,
  depositAmount,
  depositStatus,
  charges,
  chargesTotal,
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
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Cobros de turno</h2>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-slate-600">Precio del turno</dt>
          <dd className="font-semibold text-slate-900">{formatARS(priceSnapshot)}</dd>
        </div>
        {depositAmount > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-slate-600">
              Seña{' '}
              {depositCounted > 0 ? (
                <span className="text-emerald-600">✓ pagada</span>
              ) : (
                <span className="text-slate-400">({depositStatus})</span>
              )}
            </dt>
            <dd className="text-slate-700">{formatARS(depositAmount)}</dd>
          </div>
        )}
        {charges.map((c) => (
          <div key={c.id} className="flex items-center justify-between">
            <dt className="text-slate-600">
              Cobro · {METHOD_LABELS[c.method] ?? c.method}
              {c.description && c.description !== 'Cobro de turno' ? ` · ${c.description}` : ''}
            </dt>
            <dd className="text-slate-700">{formatARS(c.amount)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
          <dt className="font-medium text-slate-700">Pagado</dt>
          <dd className="font-semibold text-slate-900">{formatARS(totalPaid)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="font-medium text-slate-700">Saldo pendiente</dt>
          <dd
            className={`font-semibold ${isPaidInFull ? 'text-emerald-600' : 'text-amber-600'}`}
          >
            {isPaidInFull ? 'Pagado completo' : formatARS(pendingAmount)}
          </dd>
        </div>
      </dl>

      {!open ? (
        <button
          type="button"
          onClick={openForm}
          className="mt-4 h-9 rounded-lg border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
        >
          + Agregar cobro
        </button>
      ) : (
        <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 space-y-1">
              <label htmlFor="charge-amount" className="text-xs font-medium text-slate-700">
                Monto (ARS)
              </label>
              <input
                id="charge-amount"
                type="number"
                inputMode="numeric"
                min={1}
                value={amountPesos}
                onChange={(e) => setAmountPesos(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label htmlFor="charge-method" className="text-xs font-medium text-slate-700">
                Medio de pago
              </label>
              <select
                id="charge-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
                className="h-[38px] w-full rounded-md border border-slate-200 px-3 text-sm focus:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="mercadopago">MercadoPago</option>
                <option value="other">Otro</option>
              </select>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={onSubmit}
              className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              Registrar cobro
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
