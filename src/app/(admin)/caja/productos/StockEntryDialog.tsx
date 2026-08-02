'use client'

import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { chipClass } from '../caja-lib'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import type { StockActionResult } from './actions'

/** Subconjunto de CashPaymentMethod que acepta registerPurchaseSchema.expense
 * (sin 'other': "pagalo de la caja" es un gasto de mercadería concreto, no
 * un método ambiguo). */
type ExpenseMethod = 'cash' | 'transfer' | 'mercadopago'

const EXPENSE_METHODS: { value: ExpenseMethod; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'mercadopago', label: 'MercadoPago' },
]

/** registerPurchaseAction llega por PROP: '../actions' es `'use server'`. */
export type RegisterPurchaseAction = (input: {
  productId: string
  units: number
  unitCost?: number | null
  updateProductCost?: boolean
  /** "Pagalo de la caja" (migr. 050): crea el gasto expense/merchandise en la
   * MISMA tx que la reposición. Requiere unitCost > 0. */
  expense?: { method: ExpenseMethod } | null
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
  const [unitCostCents, setUnitCostCents] = useState<number | null>(null)
  const [updateCost, setUpdateCost] = useState(false)
  const [payFromCash, setPayFromCash] = useState(false)
  const [expenseMethod, setExpenseMethod] = useState<ExpenseMethod>('cash')
  const [note, setNote] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  const [lastProductId, setLastProductId] = useState<string | null>(null)
  if (product && product.id !== lastProductId) {
    setLastProductId(product.id)
    setPacks('1')
    setUnitsPerPack('1')
    setUnitCostCents(null)
    setUpdateCost(false)
    setPayFromCash(false)
    setExpenseMethod('cash')
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

  // "Pagalo de la caja" solo puede ofrecerse con un costo > 0 cargado. Si el
  // costo se borra (o queda en 0) mientras el checkbox estaba tildado, se
  // destilda automáticamente en vez de someter un expense fantasma.
  const hasValidCost = unitCostCents != null && unitCostCents > 0
  if (!hasValidCost && payFromCash) {
    setPayFromCash(false)
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
    if (!Number.isInteger(packsNum) || packsNum <= 0) {
      setError('Ingresá una cantidad de packs válida.')
      return
    }
    if (!Number.isInteger(unitsPerPackNum) || unitsPerPackNum <= 0) {
      setError('Ingresá unidades por pack válidas.')
      return
    }

    const unitCost = unitCostCents

    startTransition(async () => {
      try {
        const res = await registerPurchaseAction({
          productId: product.id,
          units: totalUnits,
          unitCost,
          updateProductCost: unitCost != null && updateCost,
          expense: payFromCash && unitCost != null && unitCost > 0 ? { method: expenseMethod } : undefined,
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
      <DialogContent className="w-[95vw] max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reponer — {product?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
            {/* Columna Izquierda: Cantidades e ingreso */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Detalle de unidades
              </h3>

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
                    className="h-10 rounded-lg tabular-nums"
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
                    className="h-10 rounded-lg tabular-nums"
                  />
                </div>
              </div>

              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Total a ingresar: {totalUnits} unidad{totalUnits === 1 ? '' : 'es'}
              </div>

              <div className="space-y-1">
                <Label htmlFor="se-note">Nota (opcional)</Label>
                <textarea
                  id="se-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  disabled={isPending}
                  placeholder="ej: Distribuidora Central, Factura B N° 123..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </div>

            {/* Columna Derecha: Costos y pago de caja */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Costo y pago
              </h3>

              <div className="space-y-1">
                <Label htmlFor="se-cost">Costo por unidad (pesos, opcional)</Label>
                <MoneyInput
                  id="se-cost"
                  valueCents={unitCostCents}
                  onValueChange={setUnitCostCents}
                  disabled={isPending}
                />
              </div>

              {unitCostCents != null && (
                <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateCost}
                    onChange={(e) => setUpdateCost(e.target.checked)}
                    disabled={isPending}
                    className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
                  />
                  Actualizar costo del producto
                </label>
              )}

              {hasValidCost && (
                <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={payFromCash}
                      onChange={(e) => setPayFromCash(e.target.checked)}
                      disabled={isPending}
                      className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
                    />
                    Pagalo de la caja (gasto de mercadería)
                  </label>

                  {payFromCash && (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-3 gap-1.5">
                        {EXPENSE_METHODS.map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            disabled={isPending}
                            aria-pressed={expenseMethod === m.value}
                            onClick={() => setExpenseMethod(m.value)}
                            className={chipClass(expenseMethod === m.value)}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Registra gasto de {formatArs(totalUnits * (unitCostCents ?? 0))} en la caja.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {error && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2.5 pt-2 border-t border-border/60">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleClose(false)}
              className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-60"
            >
              Cancelar
            </button>
            <Button type="button" onClick={submit} isLoading={isPending} className="px-5">
              {isPending ? 'Registrando…' : 'Registrar reposición'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
