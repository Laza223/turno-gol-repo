'use client'

import { useState, useTransition, type ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
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

/**
 * La ganancia por unidad, dicha en palabras: "Ganás $ 800 por unidad (40 % del
 * precio)". `null` si falta alguno de los dos números o si el precio todavía es
 * 0 — un 100 % sobre precio cero no informa nada y aparecería mientras el dueño
 * tipea.
 *
 * Antes decía "Margen: $ 1.200 de costo · 45%", que obligaba a saber qué es un
 * margen y mostraba el costo que el dueño acababa de escribir. Vender por debajo
 * del costo se dice como pérdida, no como un porcentaje negativo.
 */
function profitLabel(
  priceCents: number | null,
  costCents: number | null,
): { text: string; loss: boolean } | null {
  if (priceCents == null || costCents == null || priceCents <= 0) return null
  const diff = priceCents - costCents
  if (diff < 0) {
    return {
      text: `Perdés ${formatArs(-diff)} por unidad: el costo es más alto que el precio.`,
      loss: true,
    }
  }
  const pct = Math.round((diff / priceCents) * 100)
  return { text: `Ganás ${formatArs(diff)} por unidad (${pct} % del precio).`, loss: false }
}

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
  // Controla stock por defecto: el 90 % de lo que vende una cantina es
  // mercadería contable (bebidas, kiosco). Lo que no se cuenta —alquiler de
  // pecheras, fichas de ducha— es la excepción y se elige a propósito.
  const [trackStock, setTrackStock] = useState(true)
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
    setTrackStock(product ? product.stock != null : true)
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
          // Después del await, un set* suelto ya no es parte de la transición: se pintaba un
          // render antes de que `pending` bajara, con los controles todavía deshabilitados.
          startTransition(() => setError(res.error))
        }
      } catch (err) {
        Sentry.captureException(err)
        startTransition(() =>
          setError('No pudimos guardar el producto. Revisá tu conexión e intentá de nuevo.'),
        )
      }
    })
  }

  const profit = profitLabel(priceCents, costCents)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-4xl gap-6 p-6 sm:p-8" aria-describedby="pf-intro">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {product ? 'Editar producto' : 'Nuevo producto'}
          </DialogTitle>
          <p id="pf-intro" className="text-sm text-muted-foreground">
            Lo que vendés en la cantina: bebidas, cosas del kiosco o alquileres como pecheras.
          </p>
        </DialogHeader>

        {/* Dos bloques con su título, separados por una línea: "qué es y cuánto
            sale" a la izquierda, "cuántos hay" a la derecha. Cada campo lleva
            una línea que explica para qué sirve: el que carga su primer
            producto no tiene por qué saber qué es un stock mínimo. */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-0 md:divide-x md:divide-border">
          <section aria-labelledby="pf-sec-producto" className="space-y-5 md:pr-8">
            <h3 id="pf-sec-producto" className="text-sm font-semibold text-foreground">
              El producto
            </h3>

            <Field
              id="pf-name"
              label="Nombre del producto"
              help="Como lo vas a buscar al vender. Poné el tamaño si tenés varios."
            >
              <Input
                id="pf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="Ej: Gatorade 500ml"
                disabled={isPending}
                aria-describedby="pf-name-help"
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
              <Field id="pf-price" label="Precio (pesos)" help="Lo que paga el cliente por unidad.">
                <MoneyInput
                  id="pf-price"
                  valueCents={priceCents}
                  onValueChange={setPriceCents}
                  disabled={isPending}
                  aria-describedby="pf-price-help"
                />
              </Field>
              <Field
                id="pf-cost"
                label="Costo (opcional)"
                help="Lo que te sale a vos comprar una unidad. Sirve para saber cuánto ganás."
              >
                <MoneyInput
                  id="pf-cost"
                  valueCents={costCents}
                  onValueChange={setCostCents}
                  disabled={isPending}
                  aria-describedby="pf-cost-help"
                />
              </Field>
            </div>

            {/* La ganancia vive acá, al lado de los dos números que la forman:
                es un dato que el dueño mira cuando decide un precio, no cada
                vez que repasa el stock. */}
            {profit && (
              <p
                className={cn(
                  'rounded-lg px-3 py-2 text-sm',
                  profit.loss
                    ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                    : 'bg-muted text-foreground',
                )}
              >
                {profit.text}
              </p>
            )}
          </section>

          <section aria-labelledby="pf-sec-stock" className="space-y-5 md:pl-8">
            <h3 id="pf-sec-stock" className="text-sm font-semibold text-foreground">
              Stock
            </h3>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium text-foreground">
                ¿Querés llevar la cuenta de cuántas unidades tenés?
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
              <p className="text-xs text-muted-foreground">
                {trackStock
                  ? 'Cada venta descuenta una unidad y te avisamos cuando queda poco. Para bebidas y kiosco.'
                  : 'Se vende sin límite de unidades. Para servicios y alquileres: pecheras, fichas de ducha.'}
              </p>
            </fieldset>

            {trackStock && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
                <Field
                  id="pf-stock"
                  label={stockLockedFromCatalog ? 'Stock actual' : 'Stock inicial'}
                  help={
                    stockLockedFromCatalog
                      ? 'Se corrige con Reponer o con una salida de stock, no desde acá.'
                      : 'Cuántas unidades tenés hoy. Después se ajusta solo con cada venta y reposición.'
                  }
                >
                  <Input
                    id="pf-stock"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder={stockLockedFromCatalog ? undefined : 'Ej: 24'}
                    disabled={isPending || stockLockedFromCatalog}
                    aria-describedby="pf-stock-help"
                    className="tabular-nums"
                  />
                </Field>
                <Field
                  id="pf-minstock"
                  label="Stock mínimo (alerta)"
                  help="Cuando queden esta cantidad o menos, te avisamos que hay que reponer. Opcional."
                >
                  <Input
                    id="pf-minstock"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    placeholder="Ej: 6"
                    disabled={isPending}
                    aria-describedby="pf-minstock-help"
                    className="tabular-nums"
                  />
                </Field>
              </div>
            )}
          </section>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2.5 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleClose(false)}
            className="h-11 rounded-lg border border-border px-5 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60 md:h-10"
          >
            Cancelar
          </button>
          <Button
            type="button"
            isLoading={isPending}
            onClick={submit}
            className="h-11 px-6 md:h-10"
          >
            {isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Un campo con su línea de ayuda debajo. La ayuda cuelga del input por
 * `aria-describedby` (`{id}-help`): el lector de pantalla la lee junto con el
 * rótulo, no queda como texto suelto.
 */
function Field({
  id,
  label,
  help,
  children,
}: {
  id: string
  label: string
  help: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <p id={`${id}-help`} className="text-xs leading-relaxed text-muted-foreground">
        {help}
      </p>
    </div>
  )
}
