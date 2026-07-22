'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Minus, Pencil, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { chipClass, canteenStockBadge, type StockBadge } from '../caja-lib'
import { formatArs } from '@/lib/format'
import type { SellTicketActionResult } from '../cantina/actions'
import { toast } from '@/hooks/use-toast'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import { cn } from '@/lib/utils'

/**
 * sellTicketAction llega por PROP: '../cantina/actions' es `'use server'` y
 * arrastra drizzle/postgres al bundle de browser (mismo motivo que
 * RegisterMovementModal). Ticket de 1 sola línea acá — el multi-ítem es
 * Fase 3, esta UX sigue siendo la de siempre (grid + 2 taps).
 */
export type SellTicketAction = (input: {
  lines: { productId: string; qty: number }[]
  method: 'cash' | 'transfer' | 'mercadopago'
  clientIdempotencyKey: string
}) => Promise<SellTicketActionResult>

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'mercadopago', label: 'MercadoPago' },
] as const

type SaleMethod = (typeof METHOD_OPTIONS)[number]['value']

// Venta rápida con un toque: el producto ya tiene precio cargado, solo se elige
// cantidad y método. Touch targets ≥44px en todo el flujo (uso desde el celular).
export function CanteenQuickSale({
  products,
  sellTicketAction,
  onConfigureClick,
  isInDialog,
}: {
  products: CanteenProductRow[]
  sellTicketAction: SellTicketAction
  onConfigureClick?: () => void
  isInDialog?: boolean
}) {
  const router = useRouter()
  const [sale, setSale] = useState<CanteenProductRow | null>(null)

  // Sin override (dashboard): "Configurar" navega al catálogo dedicado
  // (/caja/productos), que es donde vive ahora el editor de productos.
  const handleConfigure =
    onConfigureClick ?? (() => router.push('/caja/productos?configureCanteen=true'))
  const inDialog = isInDialog ?? Boolean(onConfigureClick)

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-medium text-foreground">Cantina/Bar</h2>
        <button
          type="button"
          onClick={handleConfigure}
          className={cn(
            'inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            inDialog && 'mr-7 sm:mr-8',
          )}
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
            onClick={handleConfigure}
            className="mt-3 h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Configurar productos
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => {
            const badge = canteenStockBadge(p.stock, p.minStock)
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
        product={sale}
        onClose={() => setSale(null)}
        onSold={() => router.refresh()}
        sellTicketAction={sellTicketAction}
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
  product,
  onClose,
  onSold,
  sellTicketAction,
}: {
  product: CanteenProductRow | null
  onClose: () => void
  onSold: () => void
  sellTicketAction: SellTicketAction
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
        const res = await sellTicketAction({
          lines: [{ productId: product.id, qty }],
          method,
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
