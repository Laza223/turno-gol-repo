'use client'

import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { chipClass } from '../caja-lib'
import { toast } from '@/hooks/use-toast'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import type { ProductActionResult } from './actions'

type ProductFormFields = {
  name: string
  price: number
  cost?: number | null
  stock?: number | null
  minStock?: number | null
}

/**
 * createProductAction/updateProductAction llegan por PROP: '../actions' es
 * `'use server'` y arrastra drizzle/postgres al bundle de browser (mismo
 * motivo que RegisterMovementModal/CanteenQuickSale).
 */
export type CreateProductAction = (input: ProductFormFields) => Promise<ProductActionResult>
export type UpdateProductAction = (input: {
  productId: string
  patch: Partial<ProductFormFields> & { isActive?: boolean }
}) => Promise<ProductActionResult>

export function ProductFormDialog({
  open,
  product,
  onClose,
  onSaved,
  createProductAction,
  updateProductAction,
}: {
  open: boolean
  /** null = alta; con valor = edición. */
  product: CanteenProductRow | null
  onClose: () => void
  onSaved: () => void
  createProductAction: CreateProductAction
  updateProductAction: UpdateProductAction
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [priceCents, setPriceCents] = useState<number | null>(null)
  const [costCents, setCostCents] = useState<number | null>(null)
  const [trackStock, setTrackStock] = useState(false)
  const [stock, setStock] = useState('')
  const [minStock, setMinStock] = useState('')

  // El diálogo se abre una vez por producto (o por alta): al cambiar el
  // "sujeto" (id del producto, o null en alta) se re-inicializan los campos.
  const [lastKey, setLastKey] = useState<string | null>('__unset__')
  const key = product?.id ?? '__new__'
  if (open && key !== lastKey) {
    setLastKey(key)
    setName(product?.name ?? '')
    setPriceCents(product ? product.price : null)
    setCostCents(product?.cost ?? null)
    setTrackStock(product ? product.stock != null : false)
    setStock(product?.stock != null ? String(product.stock) : '')
    setMinStock(product?.minStock != null ? String(product.minStock) : '')
    setError(null)
  }

  // Un producto en EDICIÓN que YA controla stock: el número real vive en el
  // ledger (Reposición/Merma/Ajuste); el form de catálogo no puede pisarlo
  // con un snapshot stale del diálogo — eso perdía ventas concurrentes
  // (RI #4 D4). Se calcula sobre `product` (estable mientras el diálogo está
  // abierto para este `key`), no sobre el toggle en vivo.
  const originallyControlled = product ? product.stock != null : false
  const stockLockedFromCatalog = originallyControlled && trackStock

  function handleClose(next: boolean) {
    if (isPending) return
    if (!next) {
      setLastKey('__unset__')
      onClose()
    }
  }

  function submit() {
    setError(null)
    const trimmedName = name.trim()
    if (trimmedName === '') {
      setError('Ingresá un nombre.')
      return
    }
    if (priceCents == null || priceCents <= 0) {
      setError('Ingresá un precio válido mayor a 0.')
      return
    }
    const price = priceCents
    const cost = costCents

    let minStockValue: number | null = null
    if (trackStock && minStock.trim() !== '') {
      const minStockNum = Number(minStock)
      if (!Number.isInteger(minStockNum) || minStockNum < 0) {
        setError('Stock mínimo inválido.')
        return
      }
      minStockValue = minStockNum
    }

    // `stock` en el patch: solo va si hay un cambio real de modo (o, en
    // alta, el valor inicial). Un producto que YA controla stock y sigue
    // controlándolo NO manda `stock` — el input está deshabilitado y el
    // número se ajusta desde Reposición/Merma/Ajuste (ver
    // stockLockedFromCatalog más arriba).
    let stockValue: number | null | undefined
    if (!product) {
      // Alta: sin cambios respecto al comportamiento previo.
      stockValue = null
      if (trackStock) {
        const stockNum = Number(stock)
        if (stock.trim() === '' || !Number.isInteger(stockNum) || stockNum < 0) {
          setError('Ingresá el stock inicial (entero, 0 o más).')
          return
        }
        stockValue = stockNum
      }
    } else if (stockLockedFromCatalog) {
      stockValue = undefined
    } else if (trackStock) {
      // Estaba sin control y se activa ahora: manda el stock inicial.
      const stockNum = Number(stock)
      if (stock.trim() === '' || !Number.isInteger(stockNum) || stockNum < 0) {
        setError('Ingresá el stock inicial (entero, 0 o más).')
        return
      }
      stockValue = stockNum
    } else if (originallyControlled) {
      // Se desactiva el control.
      stockValue = null
    } else {
      // No controlaba y sigue sin controlar: sin cambios.
      stockValue = undefined
    }

    startTransition(async () => {
      try {
        const res = product
          ? await updateProductAction({
              productId: product.id,
              patch: { name: trimmedName, price, cost, stock: stockValue, minStock: minStockValue },
            })
          : await createProductAction({
              name: trimmedName,
              price,
              cost,
              stock: stockValue,
              minStock: minStockValue,
            })
        if (res.success) {
          toast({ title: product ? 'Producto actualizado' : 'Producto creado', variant: 'success' })
          setLastKey('__unset__')
          onSaved()
          onClose()
        } else {
          setError(res.error)
        }
      } catch (err) {
        Sentry.captureException(err)
        setError('No pudimos guardar el producto. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
            {/* Columna Izquierda: Información de producto */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="pf-name">Nombre del producto</Label>
                <Input
                  id="pf-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  placeholder="Ej: Gatorade 500ml, Alquiler Pecheras"
                  disabled={isPending}
                  className="h-10 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pf-price">Precio (pesos)</Label>
                  <MoneyInput
                    id="pf-price"
                    valueCents={priceCents}
                    onValueChange={setPriceCents}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pf-cost">Costo (opcional)</Label>
                  <MoneyInput
                    id="pf-cost"
                    valueCents={costCents}
                    onValueChange={setCostCents}
                    disabled={isPending}
                  />
                </div>
              </div>
            </div>

            {/* Columna Derecha: Control de Stock */}
            <div className="space-y-3">
              <fieldset>
                <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Control de stock
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={trackStock}
                    disabled={isPending}
                    onClick={() => setTrackStock(true)}
                    className={chipClass(trackStock)}
                  >
                    Sí, controlar
                  </button>
                  <button
                    type="button"
                    aria-pressed={!trackStock}
                    disabled={isPending}
                    onClick={() => setTrackStock(false)}
                    className={chipClass(!trackStock)}
                  >
                    No controlar
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {trackStock
                    ? 'Controla inventario físico disponible (ej: Agua, Gatorade, cerveza, alfajores).'
                    : 'Sin límite de stock. Ideal para servicios o alquileres (ej: Alquiler de pecheras, pelotas, fichas de ducha, pases).'}
                </p>
              </fieldset>

              {trackStock && (
                <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="space-y-1">
                    <Label htmlFor="pf-stock">
                      {stockLockedFromCatalog ? 'Stock actual' : 'Stock inicial'}
                    </Label>
                    <Input
                      id="pf-stock"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={stock}
                      onChange={(e) => setStock(e.target.value)}
                      disabled={isPending || stockLockedFromCatalog}
                      className="h-10 rounded-lg tabular-nums"
                    />
                    {stockLockedFromCatalog && (
                      <p className="text-xs text-muted-foreground">
                        Se ajusta desde Reposición o Merma.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pf-minstock">Stock mínimo (alerta)</Label>
                    <Input
                      id="pf-minstock"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={minStock}
                      onChange={(e) => setMinStock(e.target.value)}
                      disabled={isPending}
                      className="h-10 rounded-lg tabular-nums"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2.5 pt-2 border-t border-border/60">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleClose(false)}
              className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-60"
            >
              Cancelar
            </button>
            <Button type="button" isLoading={isPending} onClick={submit} className="px-5">
              {isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
