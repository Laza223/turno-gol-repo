'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Minus, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import Combobox, { type ComboboxOption } from '@/components/ui/combobox'
import {
  chipClass,
  canteenStockBadge,
  stockBadgeToneClass,
  METHOD_OPTIONS,
  type SaleMethod,
  type StockBadge,
} from '../caja-lib'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import type { CreateTabActionResult, SellTicketActionResult } from './actions'
import {
  addProduct,
  decrementLine,
  incrementLine,
  maxQtyFor,
  removeLine,
  ticketTotal,
  type TicketLine,
} from './ticket-lib'
import { TabDialog } from './TabDialog'

export type SellTicketAction = (input: {
  lines: { productId: string; qty: number }[]
  method: 'cash' | 'transfer' | 'mercadopago'
  clientIdempotencyKey: string
}) => Promise<SellTicketActionResult>

export type CreateTabAction = (input: {
  debtorName: string
  lines: { productId: string; qty: number }[]
  note?: string
  clientIdempotencyKey: string
}) => Promise<CreateTabActionResult>

export function TicketPanel({
  products,
  sellTicketAction,
  createTabAction,
  isInDialog,
  saleDisabled = false,
}: {
  products: CanteenProductRow[]
  sellTicketAction: SellTicketAction
  createTabAction?: CreateTabAction
  isInDialog?: boolean
  /** true = caja de hoy cerrada: cobrar queda deshabilitado, anotar fiado sigue activo. */
  saleDisabled?: boolean
}) {
  const router = useRouter()
  const [lines, setLines] = useState<TicketLine[]>([])
  const [method, setMethod] = useState<SaleMethod>('cash')
  const [comboboxValue, setComboboxValue] = useState('')
  const [recentIds, setRecentIds] = useState<string[]>(() => products.slice(0, 6).map((p) => p.id))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Una key por ticket: se genera al agregar el primer ítem y se regenera
  // recién tras cobrar OK (mismo criterio anti doble-tap que CanteenQuickSale/Fix #55).
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  const [tabDialogOpen, setTabDialogOpen] = useState(false)

  const total = ticketTotal(lines)

  const recentProducts = recentIds
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is CanteenProductRow => p != null)

  const comboboxOptions: ComboboxOption[] = products.map((p) => {
    const badge = canteenStockBadge(p.stock, p.minStock)
    const hint = badge
      ? `${formatArs(p.price)} · ${badge.label}`
      : `${formatArs(p.price)} · Servicio / Alquiler`
    return {
      value: p.id,
      label: p.name,
      hint,
    }
  })

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
    setRecentIds((prev) => [product.id, ...prev.filter((id) => id !== product.id)].slice(0, 6))
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

  function handleTabSuccess() {
    setLines([])
    setMethod('cash')
    setIdempotencyKey(null)
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
    <div className="grid gap-4 md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-xs">
        {/* Desplegable / Buscador de productos */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="ticket-product-combobox" className="text-xs font-semibold text-foreground">
              Buscar o seleccionar producto / servicio
            </label>
            {isInDialog && (
              <button
                type="button"
                onClick={() => router.push('/caja/productos?configureCanteen=true')}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Configurar
              </button>
            )}
          </div>
          <Combobox
            id="ticket-product-combobox"
            options={comboboxOptions}
            value={comboboxValue}
            onChange={(val) => {
              if (!val) return
              const prod = products.find((p) => p.id === val)
              if (prod) {
                handleAdd(prod)
                setComboboxValue('')
              }
            }}
            placeholder="Escribí o desplegá para buscar..."
            inputClassName="h-11 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:ring-2 focus-visible:ring-emerald-500"
            listboxLabel="Productos y servicios de cantina"
            emptyMessage="No se encontraron productos."
          />
        </div>

        {/* Sección "Recientes / Accesos rápidos" */}
        {recentProducts.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Recientes / Accesos rápidos</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentProducts.map((p) => {
                const badge = canteenStockBadge(p.stock, p.minStock)
                const out = badge?.tone === 'out'
                const line = lines.find((l) => l.productId === p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleAdd(p)}
                    disabled={out || isPending}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-emerald-500 hover:bg-accent disabled:opacity-50 md:min-h-9"
                  >
                    <span>{p.name}</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {formatArs(p.price)}
                    </span>
                    {line && (
                      <span className="rounded-full bg-primary px-1.5 py-0.2 text-[10px] font-bold text-primary-foreground">
                        ×{line.qty}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Grilla completa por categorías */}
        <div className="space-y-2 pt-2 border-t border-border" data-testid="canteen-catalog">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Catálogo completo
          </div>
          <div className="grid content-start grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {(() => {
              const renderProductButton = (p: CanteenProductRow) => {
                const badge = canteenStockBadge(p.stock, p.minStock)
                const out = badge?.tone === 'out'
                const line = lines.find((l) => l.productId === p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleAdd(p)}
                    disabled={out || isPending}
                    className="min-h-[64px] flex flex-col justify-between rounded-lg border border-border bg-card p-3 text-left transition-all hover:border-emerald-500 hover:bg-primary/5 active:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:border-emerald-500 dark:hover:bg-emerald-500/10"
                  >
                    <div>
                      <span className="block truncate text-sm font-semibold text-foreground">{p.name}</span>
                      <span className="block text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatArs(p.price)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      {badge ? (
                        <StockChip badge={badge} />
                      ) : (
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Servicio / Alquiler
                        </span>
                      )}
                      {line && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                          ×{line.qty}
                        </span>
                      )}
                    </div>
                  </button>
                )
              }

              const tracked = products.filter((p) => p.stock !== null)
              const untracked = products.filter((p) => p.stock === null)
              const hasBoth = tracked.length > 0 && untracked.length > 0

              if (hasBoth) {
                return (
                  <>
                    <div className="col-span-full text-[11px] font-medium text-muted-foreground pt-1">
                      Productos (con stock)
                    </div>
                    {tracked.map(renderProductButton)}
                    <div className="col-span-full text-[11px] font-medium text-muted-foreground pt-2 border-t border-border mt-1">
                      Servicios y Alquileres
                    </div>
                    {untracked.map(renderProductButton)}
                  </>
                )
              }

              return products.map(renderProductButton)
            })()}
          </div>
        </div>
      </div>

      <div
        className={cn(
          'flex flex-col justify-between rounded-lg border border-border bg-card shadow-xs',
          !isInDialog && 'lg:sticky lg:top-4 lg:self-start',
        )}
      >
        <div>
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-medium text-foreground">Ticket</h2>
          </div>

          {lines.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Tocá un producto o servicio para empezar
            </p>
          ) : (
            <ul className="divide-y divide-border max-h-[260px] overflow-y-auto">
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
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                    >
                      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => incrementLine(prev, l.productId))}
                      disabled={isPending || l.qty >= maxQtyFor(l.stock)}
                      aria-label={`Sumar uno a ${l.name}`}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => removeLine(prev, l.productId))}
                      disabled={isPending}
                      aria-label={`Quitar ${l.name} del ticket`}
                      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-red-600 disabled:opacity-40 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t border-border p-4">
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-foreground">Método de pago</legend>
            <div className="grid grid-cols-3 gap-2">
              {METHOD_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  disabled={isPending || saleDisabled}
                  aria-pressed={method === m.value}
                  className={chipClass(method === m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={isPending || lines.length === 0 || saleDisabled}
            aria-describedby={saleDisabled ? 'ticket-sale-disabled-hint' : undefined}
            className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {isPending ? 'Cobrando…' : `Cobrar ${formatArs(total)}`}
          </button>
          {saleDisabled && (
            <p id="ticket-sale-disabled-hint" className="text-xs text-muted-foreground">
              Caja cerrada — el cobro se habilita cuando la caja esté abierta.
            </p>
          )}
          {createTabAction && lines.length > 0 && (
            <button
              type="button"
              onClick={() => setTabDialogOpen(true)}
              disabled={isPending}
              className="h-11 w-full rounded-md border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              Anotar como fiado
            </button>
          )}
        </div>
      </div>

      {createTabAction && (
        <TabDialog
          open={tabDialogOpen}
          onOpenChange={setTabDialogOpen}
          lines={lines}
          total={total}
          createTabAction={createTabAction}
          onSuccess={handleTabSuccess}
        />
      )}
    </div>
  )
}

function StockChip({ badge }: { badge: StockBadge }) {
  return (
    <span className={`text-[11px] font-medium ${stockBadgeToneClass(badge.tone)}`}>
      {badge.label}
    </span>
  )
}
