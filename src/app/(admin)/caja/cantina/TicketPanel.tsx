'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import { chipClass, canteenStockBadge, type StockBadge } from '../caja-lib'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import type { SellTicketActionResult } from './actions'
import {
  addProduct,
  decrementLine,
  incrementLine,
  maxQtyFor,
  removeLine,
  ticketTotal,
  type TicketLine,
} from './ticket-lib'

/**
 * sellTicketAction llega por PROP: './actions' (mismo directorio) es
 * `'use server'` y arrastra drizzle/postgres al bundle de browser (mismo
 * motivo que RegisterMovementModal). Reemplaza CanteenQuickSale (Fase 3):
 * la venta ahora es un ticket multi-ítem — tap suma producto, un solo
 * "Cobrar". Venta de 1 ítem sigue siendo 2 taps (tap producto + tap Cobrar).
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

export function TicketPanel({
  products,
  sellTicketAction,
  isInDialog,
}: {
  products: CanteenProductRow[]
  sellTicketAction: SellTicketAction
  isInDialog?: boolean
}) {
  const router = useRouter()
  const [lines, setLines] = useState<TicketLine[]>([])
  const [method, setMethod] = useState<SaleMethod>('cash')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Una key por ticket: se genera al agregar el primer ítem y se regenera
  // recién tras cobrar OK (mismo criterio anti doble-tap que CanteenQuickSale/Fix #55).
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)

  const total = ticketTotal(lines)

  function handleAdd(product: CanteenProductRow) {
    if (isPending) return
    setError(null)
    setLines((prev) =>
      addProduct(prev, {
        id: product.id,
        name: product.name,
        price: product.price,
        stock: product.stock,
      }),
    )
    setIdempotencyKey((prev) => prev ?? crypto.randomUUID())
  }

  function submit() {
    if (lines.length === 0 || !idempotencyKey) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await sellTicketAction({
          lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
          method,
          clientIdempotencyKey: idempotencyKey,
        })
        if (res.success) {
          toast({ title: `Venta registrada — ${formatArs(res.total)}`, variant: 'success' })
          setLines([])
          setMethod('cash')
          setIdempotencyKey(null)
          router.refresh()
        } else {
          setError(res.error)
        }
      } catch (err) {
        Sentry.captureException(err)
        setError('No pudimos registrar la venta. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-6 text-center shadow-xs">
        <p className="text-sm text-muted-foreground">
          Cargá tus productos (agua, gatorade, cerveza…) y registrá cada venta con un toque.
        </p>
        <button
          type="button"
          onClick={() => router.push('/caja/productos?configureCanteen=true')}
          className="mt-3 h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Configurar productos
        </button>
      </div>
    )
  }

  return (
    <div className={cn('grid gap-4', !isInDialog && 'lg:grid-cols-[1fr_360px]')}>
      <div className="grid content-start grid-cols-2 gap-2 rounded-lg border border-border bg-card p-4 shadow-xs sm:grid-cols-3 lg:grid-cols-4">
        {/* En la página, la tab "Productos y stock" ya está visible arriba; en el
            diálogo del dashboard no hay tabs — sin este atajo, editar el catálogo
            exigía cerrar y navegar por el sidebar (paridad con CanteenQuickSale). */}
        {isInDialog && (
          <div className="col-span-full -mb-1 flex justify-end">
            <button
              type="button"
              onClick={() => router.push('/caja/productos?configureCanteen=true')}
              className="mr-7 inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:mr-8"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Configurar
            </button>
          </div>
        )}
        {products.map((p) => {
          const badge = canteenStockBadge(p.stock, p.minStock)
          const out = badge?.tone === 'out'
          const line = lines.find((l) => l.productId === p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleAdd(p)}
              disabled={out || isPending}
              className="min-h-[56px] rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-emerald-400 hover:bg-primary/5 active:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:border-emerald-500 dark:hover:bg-emerald-500/10 dark:active:bg-emerald-500/15"
            >
              <span className="block truncate text-sm font-semibold text-foreground">{p.name}</span>
              <span className="block text-sm tabular-nums text-muted-foreground">{formatArs(p.price)}</span>
              {badge && <StockChip badge={badge} />}
              {line && (
                <span className="mt-1 inline-block rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-semibold text-white dark:bg-emerald-600">
                  ×{line.qty}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div
        className={cn(
          'rounded-lg border border-border bg-card shadow-xs',
          !isInDialog && 'lg:sticky lg:top-4 lg:self-start',
        )}
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-medium text-foreground">Ticket</h2>
        </div>

        {lines.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Tocá un producto para empezar
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {lines.map((l) => (
              <li key={l.productId} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{l.name}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">{formatArs(l.price * l.qty)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setLines((prev) => decrementLine(prev, l.productId))}
                    disabled={isPending}
                    aria-label={`Restar uno a ${l.name}`}
                    className="flex h-11 w-11 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => incrementLine(prev, l.productId))}
                    disabled={isPending || l.qty >= maxQtyFor(l.stock)}
                    aria-label={`Sumar uno a ${l.name}`}
                    className="flex h-11 w-11 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => removeLine(prev, l.productId))}
                    disabled={isPending}
                    aria-label={`Quitar ${l.name} del ticket`}
                    className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-red-600 disabled:opacity-40 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 border-t border-border p-4">
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-foreground">Método de pago</legend>
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
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={isPending || lines.length === 0}
            className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {isPending ? 'Cobrando…' : `Cobrar ${formatArs(total)}`}
          </button>
        </div>
      </div>
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
