'use client'

import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import type { StockActionResult } from './actions'

/** registerPurchaseAction llega por PROP: '../actions' es `'use server'`. */
export type RegisterPurchaseAction = (input: {
  productId: string
  units: number
  unitCost?: number | null
  updateProductCost?: boolean
  note?: string | null
  clientIdempotencyKey: string
}) => Promise<StockActionResult>

/**
 * Reposición de mercadería. La UI pide packs × unidades por pack (así se
 * carga como llega la mercadería) y manda `units` TOTALES al service —
 * ver RegisterPurchaseInput (canteen.types.ts).
 */
export function StockEntryDialog({
  product,
  onClose,
  onSaved,
  registerPurchaseAction,
}: {
  product: CanteenProductRow | null
  onClose: () => void
  onSaved: () => void
  registerPurchaseAction: RegisterPurchaseAction
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [packs, setPacks] = useState('1')
  const [unitsPerPack, setUnitsPerPack] = useState('1')
  const [unitCostPesos, setUnitCostPesos] = useState('')
  const [updateCost, setUpdateCost] = useState(false)
  const [note, setNote] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  const [lastProductId, setLastProductId] = useState<string | null>(null)
  if (product && product.id !== lastProductId) {
    setLastProductId(product.id)
    setPacks('1')
    setUnitsPerPack('1')
    setUnitCostPesos('')
    setUpdateCost(false)
    setNote('')
    setError(null)
    setIdempotencyKey(crypto.randomUUID())
  }

  const packsNum = Number(packs)
  const unitsPerPackNum = Number(unitsPerPack)
  const totalUnits =
    Number.isFinite(packsNum) && Number.isFinite(unitsPerPackNum)
      ? Math.max(0, Math.round(packsNum * unitsPerPackNum))
      : 0

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
    if (!Number.isInteger(packsNum) || packsNum <= 0) {
      setError('Ingresá una cantidad de packs válida.')
      return
    }
    if (!Number.isInteger(unitsPerPackNum) || unitsPerPackNum <= 0) {
      setError('Ingresá unidades por pack válidas.')
      return
    }

    let unitCost: number | null = null
    if (unitCostPesos.trim() !== '') {
      const costNum = Number(unitCostPesos)
      if (!Number.isFinite(costNum) || costNum < 0) {
        setError('Costo por unidad inválido.')
        return
      }
      unitCost = Math.round(costNum * 100)
    }

    startTransition(async () => {
      try {
        const res = await registerPurchaseAction({
          productId: product.id,
          units: totalUnits,
          unitCost,
          updateProductCost: unitCost != null && updateCost,
          note: note.trim() === '' ? null : note.trim(),
          clientIdempotencyKey: idempotencyKey,
        })
        if (res.success) {
          toast({
            title: `Reposición registrada — ${totalUnits} unidad${totalUnits === 1 ? '' : 'es'}`,
            variant: 'success',
          })
          setLastProductId(null)
          onSaved()
          onClose()
        } else {
          setError(res.error)
        }
      } catch (err) {
        Sentry.captureException(err)
        setError('No pudimos registrar la reposición. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  return (
    <Dialog open={product !== null} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reponer — {product?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="se-packs">Packs</Label>
              <Input
                id="se-packs"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={packs}
                onChange={(e) => setPacks(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="se-per-pack">Unidades por pack</Label>
              <Input
                id="se-per-pack"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={unitsPerPack}
                onChange={(e) => setUnitsPerPack(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            = {totalUnits} unidad{totalUnits === 1 ? '' : 'es'}
          </p>
          <div className="space-y-1">
            <Label htmlFor="se-cost">Costo por unidad (pesos, opcional)</Label>
            <Input
              id="se-cost"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={unitCostPesos}
              onChange={(e) => setUnitCostPesos(e.target.value)}
              disabled={isPending}
            />
          </div>
          {unitCostPesos.trim() !== '' && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={updateCost}
                onChange={(e) => setUpdateCost(e.target.checked)}
                disabled={isPending}
                className="h-4 w-4 rounded border-border"
              />
              Actualizar costo del producto
            </label>
          )}
          <div className="space-y-1">
            <Label htmlFor="se-note">Nota (opcional)</Label>
            <textarea
              id="se-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              disabled={isPending}
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
            {isPending ? 'Registrando…' : 'Registrar reposición'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
