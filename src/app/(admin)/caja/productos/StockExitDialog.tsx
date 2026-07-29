'use client'

import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { chipClass } from '../caja-lib'
import { toast } from '@/hooks/use-toast'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import type { StockActionResult } from './actions'

/** registerStockExitAction llega por PROP: '../actions' es `'use server'`. */
export type RegisterStockExitAction = (input: {
  productId: string
  units: number
  reason: 'waste' | 'courtesy' | 'internal_use'
  note: string
  clientIdempotencyKey: string
}) => Promise<StockActionResult>

const REASONS = [
  { value: 'waste', label: 'Merma/rotura' },
  { value: 'courtesy', label: 'Cortesía' },
  { value: 'internal_use', label: 'Consumo interno' },
] as const

type ExitReason = (typeof REASONS)[number]['value']

/**
 * Salida no comercial: mueve stock, NO toca caja. El motivo es obligatorio
 * (mismo criterio que `registerStockExitSchema` — es lo que hace auditable
 * la salida sin venta).
 */
export function StockExitDialog({
  product,
  onClose,
  onSaved,
  registerStockExitAction,
}: {
  product: CanteenProductRow | null
  onClose: () => void
  onSaved: () => void
  registerStockExitAction: RegisterStockExitAction
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState<ExitReason>('waste')
  const [units, setUnits] = useState('1')
  const [note, setNote] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  const [lastProductId, setLastProductId] = useState<string | null>(null)
  if (product && product.id !== lastProductId) {
    setLastProductId(product.id)
    setReason('waste')
    setUnits('1')
    setNote('')
    setError(null)
    setIdempotencyKey(crypto.randomUUID())
  }

  function handleClose(next: boolean) {
    if (isPending) return
    if (!next) {
      setLastProductId(null)
      onClose()
    }
  }

  function submit() {
    if (!product) return
    setError(null)
    const unitsNum = Number(units)
    if (!Number.isInteger(unitsNum) || unitsNum <= 0) {
      setError('Ingresá una cantidad válida.')
      return
    }
    if (note.trim() === '') {
      setError('Contá el motivo de la salida.')
      return
    }

    startTransition(async () => {
      try {
        const res = await registerStockExitAction({
          productId: product.id,
          units: unitsNum,
          reason,
          note: note.trim(),
          clientIdempotencyKey: idempotencyKey,
        })
        if (res.success) {
          toast({ title: 'Salida registrada', variant: 'success' })
          setLastProductId(null)
          onSaved()
          onClose()
        } else {
          setError(res.error)
        }
      } catch (err) {
        Sentry.captureException(err)
        setError('No pudimos registrar la salida. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  return (
    <Dialog open={product !== null} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Salida — {product?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Esto no toca la caja: solo descuenta stock.
          </p>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-foreground">Motivo</legend>
            <div className="grid grid-cols-3 gap-2">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={reason === r.value}
                  disabled={isPending}
                  onClick={() => setReason(r.value)}
                  className={chipClass(reason === r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="sx-units">Cantidad</Label>
            <Input
              id="sx-units"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sx-note">Nota</Label>
            <textarea
              id="sx-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              disabled={isPending}
              placeholder="ej: latas vencidas, agua para el árbitro…"
              className="min-h-11 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          {error && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Registrando…' : 'Registrar salida'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
