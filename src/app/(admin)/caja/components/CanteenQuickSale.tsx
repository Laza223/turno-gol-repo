'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { chipClass, canteenStockBadge, type StockBadge } from '../caja-lib'
import { formatArs } from '@/lib/format'
import type { CanteenProductsActionResult, SellCanteenProductResult } from '../actions'
import { occurredAtForDate } from './occurred-at'
import { toast } from '@/hooks/use-toast'
import type { CanteenProduct } from '@/modules/tenants/tenant.types'

/**
 * saveCanteenProductsAction llega por PROP, mismo motivo que
 * createCashFlowAction (ver RegisterMovementModal.tsx): '../actions' es
 * `'use server'` y arrastra drizzle/postgres a cualquier bundle de browser.
 */
export type SaveCanteenProductsAction = (
  products: { id: string; name: string; price: number; stock?: number }[],
) => Promise<CanteenProductsActionResult>

export type SellCanteenProductAction = (input: {
  productId: string
  qty: number
  method: 'cash' | 'transfer' | 'mercadopago'
  occurredAt?: Date
  clientIdempotencyKey: string
}) => Promise<SellCanteenProductResult>

// Sugerencias para el primer uso: el admin ajusta nombres y precios antes de guardar.
const SUGGESTED: Array<{ name: string; pricePesos: string }> = [
  { name: 'Agua', pricePesos: '1500' },
  { name: 'Gatorade', pricePesos: '2500' },
  { name: 'Cerveza', pricePesos: '3500' },
]

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'mercadopago', label: 'MercadoPago' },
] as const

type SaleMethod = (typeof METHOD_OPTIONS)[number]['value']

// Venta rápida con un toque: el producto ya tiene precio cargado, solo se elige
// cantidad y método. Touch targets ≥44px en todo el flujo (uso desde el celular).
export function CanteenQuickSale({
  date,
  products,
  sellCanteenProductAction,
  saveCanteenProductsAction,
}: {
  date: string
  products: CanteenProduct[]
  sellCanteenProductAction: SellCanteenProductAction
  saveCanteenProductsAction: SaveCanteenProductsAction
}) {
  const router = useRouter()
  const [sale, setSale] = useState<CanteenProduct | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-medium text-foreground">Cantina/Bar</h2>
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Configurar
        </button>
      </div>
      {products.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Cargá tus productos (agua, gatorade, cerveza…) y registrá cada venta con un toque.
          </p>
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="mt-3 h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Configurar productos
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => {
            const badge = canteenStockBadge(p.stock)
            const out = badge?.tone === 'out'
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSale(p)}
                disabled={out}
                className="min-h-[56px] rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-emerald-400 hover:bg-primary/5 active:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:border-emerald-500 dark:hover:bg-emerald-500/10 dark:active:bg-emerald-500/15"
              >
                <span className="block truncate text-sm font-semibold text-foreground">{p.name}</span>
                <span className="block text-sm tabular-nums text-muted-foreground">{formatArs(p.price)}</span>
                {badge && <StockChip badge={badge} />}
              </button>
            )
          })}
        </div>
      )}

      <QuickSaleDialog
        date={date}
        product={sale}
        onClose={() => setSale(null)}
        onSold={() => router.refresh()}
        sellCanteenProductAction={sellCanteenProductAction}
      />
      <ProductsEditorDialog
        open={editorOpen}
        products={products}
        onClose={() => setEditorOpen(false)}
        onSaved={() => router.refresh()}
        saveCanteenProductsAction={saveCanteenProductsAction}
      />
    </div>
  )
}

function StockChip({ badge }: { badge: StockBadge }) {
  const tone =
    badge.tone === 'out'
      ? 'text-red-600 dark:text-red-400'
      : badge.tone === 'low'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground'
  return <span className={`mt-0.5 block text-xs font-medium ${tone}`}>{badge.label}</span>
}

function QuickSaleDialog({
  date,
  product,
  onClose,
  onSold,
  sellCanteenProductAction,
}: {
  date: string
  product: CanteenProduct | null
  onClose: () => void
  onSold: () => void
  sellCanteenProductAction: SellCanteenProductAction
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [method, setMethod] = useState<SaleMethod>('cash')
  // Una key por venta: previene duplicados por doble-tap (mismo criterio que Fix #55).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  // El diálogo se monta una vez; al cambiar de producto se resetea el estado.
  const [lastProductId, setLastProductId] = useState<string | null>(null)
  if (product && product.id !== lastProductId) {
    setLastProductId(product.id)
    setQty(1)
    setMethod('cash')
    setError(null)
    setIdempotencyKey(crypto.randomUUID())
  }

  const total = product ? product.price * qty : 0
  // Tope de cantidad: si el producto controla stock, no se vende más de lo
  // disponible; si no, tope duro de 99.
  const maxQty = product && typeof product.stock === 'number' ? Math.max(1, product.stock) : 99

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
    startTransition(async () => {
      try {
        const res = await sellCanteenProductAction({
          productId: product.id,
          qty,
          method,
          occurredAt: occurredAtForDate(date),
          clientIdempotencyKey: idempotencyKey,
        })
        if (res.success) {
          toast({
            title: 'Venta registrada',
            description: `${qty === 1 ? product.name : `${product.name} x${qty}`} — ${formatArs(total)}`,
            variant: 'success',
          })
          setLastProductId(null)
          onSold()
          onClose()
        } else {
          setError(res.error)
        }
      } catch (err) {
        Sentry.captureException(err)
        setError('No pudimos registrar la venta. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  return (
    <Dialog open={product !== null} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{product?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cantidad</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1 || isPending}
                aria-label="Restar uno"
                className="flex h-11 w-11 items-center justify-center rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40 transition-colors"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="w-8 text-center text-lg font-semibold tabular-nums">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                disabled={isPending || qty >= maxQty}
                aria-label="Sumar uno"
                className="flex h-11 w-11 items-center justify-center rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40 transition-colors"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          {product && typeof product.stock === 'number' && (
            <p className="text-xs text-muted-foreground">
              Stock disponible: <span className="tabular-nums">{product.stock}</span>
            </p>
          )}
          <fieldset>
            <legend className="mb-1.5 text-sm text-muted-foreground">Método de pago</legend>
            <div className="grid grid-cols-3 gap-2">
              {METHOD_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  disabled={isPending}
                  aria-pressed={method === m.value}
                  className={chipClass(method === m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </fieldset>
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Registrando…' : `Registrar venta — ${formatArs(total)}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type EditorRow = { id: string; name: string; pricePesos: string; stock: string }

function ProductsEditorDialog({
  open,
  products,
  onClose,
  onSaved,
  saveCanteenProductsAction,
}: {
  open: boolean
  products: CanteenProduct[]
  onClose: () => void
  onSaved: () => void
  saveCanteenProductsAction: SaveCanteenProductsAction
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<EditorRow[] | null>(null)

  // Las filas se inicializan desde props al abrir (estado derivado perezoso).
  const editing: EditorRow[] =
    rows ??
    products.map((p) => ({
      id: p.id,
      name: p.name,
      pricePesos: String(p.price / 100),
      stock: p.stock === undefined ? '' : String(p.stock),
    }))

  function update(id: string, patch: Partial<EditorRow>) {
    setRows(editing.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function addRow(name = '', pricePesos = '') {
    setRows([...editing, { id: crypto.randomUUID(), name, pricePesos, stock: '' }])
  }

  function loadSuggested() {
    setRows(
      SUGGESTED.map((s) => ({ id: crypto.randomUUID(), name: s.name, pricePesos: s.pricePesos, stock: '' })),
    )
  }

  function handleClose(next: boolean) {
    if (isPending) return
    if (!next) {
      setRows(null)
      setError(null)
      onClose()
    }
  }

  function save() {
    setError(null)
    const cleaned = editing.filter((r) => r.name.trim() !== '' || r.pricePesos.trim() !== '')
    for (const r of cleaned) {
      const pesos = Number(r.pricePesos)
      if (r.name.trim() === '') { setError('Hay un producto sin nombre.'); return }
      if (!Number.isFinite(pesos) || pesos <= 0) {
        setError(`Precio inválido para "${r.name.trim()}".`)
        return
      }
      if (r.stock.trim() !== '') {
        const s = Number(r.stock)
        if (!Number.isInteger(s) || s < 0) {
          setError(`Stock inválido para "${r.name.trim()}".`)
          return
        }
      }
    }
    const payload = cleaned.map((r) => {
      const item: { id: string; name: string; price: number; stock?: number } = {
        id: r.id,
        name: r.name.trim(),
        price: Math.round(Number(r.pricePesos) * 100),
      }
      if (r.stock.trim() !== '') item.stock = Number(r.stock)
      return item
    })
    startTransition(async () => {
      try {
        const res = await saveCanteenProductsAction(payload)
        if (res.success) {
          toast({ title: 'Productos guardados', variant: 'success' })
          setRows(null)
          onSaved()
          onClose()
        } else {
          setError(res.error)
        }
      } catch (err) {
        Sentry.captureException(err)
        setError('No pudimos guardar los productos. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Productos de cantina</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Cada producto se vende con un toque desde la caja. El precio es por unidad, en pesos. El stock es opcional: dejalo vacío si no querés controlarlo.
          </p>
          {editing.length === 0 ? (
            <button
              type="button"
              onClick={loadSuggested}
              className="h-11 w-full rounded-md border border-dashed border-border text-sm font-medium text-muted-foreground hover:border-emerald-400 hover:text-emerald-700 transition-colors"
            >
              Cargar sugeridos (Agua, Gatorade, Cerveza)
            </button>
          ) : (
            <ul className="space-y-2">
              {editing.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={r.name}
                    onChange={(e) => update(r.id, { name: e.target.value })}
                    placeholder="Producto"
                    aria-label="Nombre del producto"
                    className="h-11 min-w-0 flex-1 rounded-md border border-border px-3 text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={r.pricePesos}
                    onChange={(e) => update(r.id, { pricePesos: e.target.value })}
                    placeholder="Precio"
                    aria-label="Precio en pesos"
                    className="h-11 w-20 rounded-md border border-border px-3 text-sm tabular-nums"
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={r.stock}
                    onChange={(e) => update(r.id, { stock: e.target.value })}
                    placeholder="Stock"
                    aria-label="Stock (opcional)"
                    className="h-11 w-16 rounded-md border border-border px-2 text-sm tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => setRows(editing.filter((x) => x.id !== r.id))}
                    aria-label={`Eliminar ${r.name.trim() || 'producto'}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {editing.length > 0 && editing.length < 24 && (
            <button
              type="button"
              onClick={() => addRow()}
              className="h-11 w-full rounded-md border border-dashed border-border text-sm font-medium text-muted-foreground hover:border-emerald-400 hover:text-emerald-700 transition-colors"
            >
              + Agregar producto
            </button>
          )}
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleClose(false)}
              className="h-11 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={save}
              className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
