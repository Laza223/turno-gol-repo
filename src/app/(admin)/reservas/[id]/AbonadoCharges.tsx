'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleAbonadoCreditAction } from '../actions'
import { toast } from '@/hooks/use-toast'

type Props = {
  bookingId: string
  /** Precio de la sesión (price_snapshot del turno fijo), en centavos. */
  priceSnapshot: number
  /** Centavos ya descontados del saldo para esta instancia (0 = no descontado). */
  creditApplied: number
  /** Saldo a favor disponible del abonado, en centavos. */
  abonadoCreditBalance: number
  /** Estado del booking: el descuento solo se opera en 'confirmed'. */
  status: string
}

function formatARS(centavos: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(centavos / 100)
}

export default function AbonadoCharges({
  bookingId,
  priceSnapshot,
  creditApplied,
  abonadoCreditBalance,
  status,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // "Mantener saldo" tildado = NO descontar. Si ya se descontó, aparece destildado.
  const keepBalance = creditApplied === 0
  const editable = status === 'confirmed'

  function onToggle() {
    if (!editable || pending) return
    setError(null)
    const nextKeep = !keepBalance
    startTransition(async () => {
      const res = await toggleAbonadoCreditAction(bookingId, nextKeep)
      if (res.success) {
        toast({
          title: nextKeep ? 'Saldo devuelto' : 'Saldo descontado',
          variant: 'success',
        })
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <section className="card-premium rounded-xl p-6">
      <h2 className="text-sm font-semibold text-foreground">Saldo a favor del abonado</h2>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Saldo disponible</dt>
          <dd className="font-semibold text-foreground">{formatARS(abonadoCreditBalance)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Precio de la sesión</dt>
          <dd className="text-foreground">{formatARS(priceSnapshot)}</dd>
        </div>
        {creditApplied > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-2">
            <dt className="font-medium text-foreground">Descontado de esta sesión</dt>
            <dd className="font-semibold text-emerald-600 dark:text-emerald-400">−{formatARS(creditApplied)}</dd>
          </div>
        )}
      </dl>

      <label className="mt-4 flex items-center gap-2.5 text-sm text-foreground">
        <input
          type="checkbox"
          checked={keepBalance}
          disabled={!editable || pending}
          onChange={onToggle}
          className="h-4 w-4 rounded border-border text-emerald-600 dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
        />
        <span>
          Mantener saldo{' '}
          <span className="text-muted-foreground">
            (destildá para descontar {formatARS(priceSnapshot)} del saldo)
          </span>
        </span>
      </label>

      {!editable && (
        <p className="mt-2 text-xs text-muted-foreground">
          El descuento de saldo solo puede modificarse mientras el turno está confirmado.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  )
}
