'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registerDebtPaymentAction } from '../actions'
import { toast } from '@/hooks/use-toast'

type Props = {
  playerId: string
  /** Saldo deudor actual en centavos. */
  balance: number
}

type Method = 'cash' | 'transfer' | 'mercadopago' | 'other'

function formatARS(centavos: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(centavos / 100)
}

export default function DebtPayment({ playerId, balance }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [amountPesos, setAmountPesos] = useState('')
  const [method, setMethod] = useState<Method>('cash')

  function openForm() {
    setError(null)
    // Prefill exacto en pesos con centavos: la deuda (price_snapshot) puede no
    // ser múltiplo de 100. toFixed(2) deja el "pagar todo" == balance, así el
    // pago salda completo y desbloquea al jugador (Math.round redondeaba para
    // arriba y el server rechazaba por sobrepago).
    setAmountPesos(balance > 0 ? (balance / 100).toFixed(2) : '')
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
    if (amount > balance) {
      setError('El monto supera la deuda pendiente.')
      return
    }
    const clientIdempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined

    startTransition(async () => {
      const res = await registerDebtPaymentAction({ playerId, amount, method, clientIdempotencyKey })
      if (res.success) {
        toast({ title: 'Pago registrado', variant: 'success' })
        setOpen(false)
        setAmountPesos('')
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Deudas</h2>
        {balance > 0 ? (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
            Debe {formatARS(balance)}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            Sin deuda
          </span>
        )}
      </div>

      {balance > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          El jugador está bloqueado para reservar online en este complejo hasta saldar la deuda.
        </p>
      )}

      {balance > 0 &&
        (!open ? (
          <button
            type="button"
            onClick={openForm}
            className="mt-4 h-9 rounded-lg border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
          >
            + Registrar pago
          </button>
        ) : (
          <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1 space-y-1">
                <label htmlFor="debt-amount" className="text-xs font-medium text-slate-700">
                  Monto (ARS)
                </label>
                <input
                  id="debt-amount"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step="0.01"
                  value={amountPesos}
                  onChange={(e) => setAmountPesos(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label htmlFor="debt-method" className="text-xs font-medium text-slate-700">
                  Medio de pago
                </label>
                <select
                  id="debt-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as Method)}
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
                Registrar pago
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
        ))}
    </section>
  )
}
