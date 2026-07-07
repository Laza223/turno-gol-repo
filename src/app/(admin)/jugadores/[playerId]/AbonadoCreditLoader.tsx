'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { loadAbonadoCreditAction } from '../actions'
import { toast } from '@/hooks/use-toast'
import type { PlayerAbonado } from '../queries'

type Props = {
  playerId: string
  abonados: PlayerAbonado[]
}

type Method = 'cash' | 'transfer' | 'mercadopago' | 'other'

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  paused: 'Pausado',
  canceled: 'Cancelado',
}

const ARS_FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

function formatARS(centavos: number): string {
  return ARS_FORMATTER.format(centavos / 100)
}

function AbonadoCard({ playerId, abonado }: { playerId: string; abonado: PlayerAbonado }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [amountPesos, setAmountPesos] = useState('')
  const [method, setMethod] = useState<Method>('cash')

  function openForm() {
    setError(null)
    setAmountPesos('')
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
      const res = await loadAbonadoCreditAction({
        abonadoId: abonado.id,
        playerId,
        amount,
        method,
        clientIdempotencyKey,
      })
      if (res.success) {
        toast({ title: 'Saldo cargado', variant: 'success' })
        setOpen(false)
        setAmountPesos('')
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {abonado.courtName} · {DAY_LABELS[abonado.dayOfWeek] ?? '—'}{' '}
            {abonado.timeStart.slice(0, 5)}–{abonado.timeEnd.slice(0, 5)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {STATUS_LABELS[abonado.status] ?? abonado.status} ·{' '}
            {formatARS(abonado.pricePerSession)}/sesión
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Saldo a favor</p>
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            {formatARS(abonado.creditBalance)}
          </p>
        </div>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={openForm}
          className="mt-3 h-11 md:h-9 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-card px-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
        >
          + Cargar saldo
        </button>
      ) : (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 space-y-1">
              <label htmlFor={`credit-amount-${abonado.id}`} className="text-xs font-medium text-foreground">
                Monto (ARS)
              </label>
              <input
                id={`credit-amount-${abonado.id}`}
                type="number"
                inputMode="decimal"
                min={0.01}
                step="0.01"
                value={amountPesos}
                onChange={(e) => setAmountPesos(e.target.value)}
                className="h-11 md:h-9 w-full rounded-md border border-border px-3 text-sm focus:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label htmlFor={`credit-method-${abonado.id}`} className="text-xs font-medium text-foreground">
                Medio de pago
              </label>
              <select
                id={`credit-method-${abonado.id}`}
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                className="h-11 md:h-9 w-full rounded-md border border-border px-3 text-sm focus:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="mercadopago">MercadoPago</option>
                <option value="other">Otro</option>
              </select>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={onSubmit}
              className="h-11 md:h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              Cargar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="h-11 md:h-9 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AbonadoCreditLoader({ playerId, abonados }: Props) {
  return (
    <section className="card-premium rounded-xl p-6">
      <h2 className="text-sm font-semibold text-foreground">Abonados</h2>
      {abonados.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">El jugador no tiene abonos en este complejo.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {abonados.map((a) => (
            <AbonadoCard key={a.id} playerId={playerId} abonado={a} />
          ))}
        </div>
      )}
    </section>
  )
}
