'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Minus, Pencil, Plus, Trash2 } from 'lucide-react'
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
  ticketCount,
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
  clientIdempotencyKey: string
}) => Promise<CreateTabActionResult>

/**
 * A partir de cuántos productos aparece el buscador.
 *
 * Con un catálogo chico —el caso normal de una cantina de complejo— buscar es
 * más lento que tocar: todas las tarjetas entran en pantalla, y el campo de
 * búsqueda solo empuja el catálogo hacia abajo. El umbral es de producto, no
 * de diseño: moverlo es cambiar este número.
 */
const SEARCH_MIN_PRODUCTS = 13

export function TicketPanel({
  products,
  sellTicketAction,
  createTabAction,
  isInDialog,
}: {
  products: CanteenProductRow[]
  sellTicketAction: SellTicketAction
  createTabAction?: CreateTabAction
  isInDialog?: boolean
}) {
  const router = useRouter()
  const [lines, setLines] = useState<TicketLine[]>([])
  const [method, setMethod] = useState<SaleMethod>('cash')
  const [comboboxValue, setComboboxValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Una key por ticket: se genera al agregar el primer ítem y se regenera
  // recién tras cobrar OK (mismo criterio anti doble-tap que CanteenQuickSale/Fix #55).
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  const [tabDialogOpen, setTabDialogOpen] = useState(false)

  const total = ticketTotal(lines)
  const count = ticketCount(lines)
  const showSearch = products.length >= SEARCH_MIN_PRODUCTS

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

  const methodChips = (
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
  )

  return (
    <>
      <div className="grid gap-4 md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-xs">
          {/* Buscador: solo con catálogo grande (ver SEARCH_MIN_PRODUCTS). */}
          {(showSearch || isInDialog) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="ticket-product-combobox"
                  className={cn('text-xs font-semibold text-foreground', !showSearch && 'sr-only')}
                >
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
              {showSearch && (
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
                  inputClassName="h-11 w-full rounded-md border border-border bg-card px-3 text-base md:text-sm focus-visible:ring-2 focus-visible:ring-emerald-500"
                  listboxLabel="Productos y servicios de cantina"
                  emptyMessage="No se encontraron productos."
                />
              )}
            </div>
          )}

          {/* El catálogo entero, sin scroll propio: con la barra de cobro pegada
              abajo en el teléfono ya no hay que acotarlo para que "Cobrar" quede
              al alcance. Antes competían el scroll de la página y el de la
              grilla, y el botón se iba de pantalla al crecer el catálogo. */}
          <div className="space-y-2" data-testid="canteen-catalog">
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
                      className={cn(
                        'min-h-[64px] flex flex-col justify-between rounded-lg border p-3 text-left transition-all hover:border-emerald-500 hover:bg-primary/5 active:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:border-emerald-500 dark:hover:bg-emerald-500/10',
                        // Lo que ya está en el ticket se marca con borde y fondo
                        // propios además del contador: el ×N solo no se ve de
                        // reojo mientras se toca rápido.
                        line
                          ? 'border-emerald-600 bg-primary/5 dark:border-emerald-500'
                          : 'border-border bg-card',
                      )}
                    >
                      <div>
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {p.name}
                        </span>
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

        {/* El ticket al costado es la vista de escritorio. En el teléfono lo
            reemplaza la barra pegada abajo: un panel apilado debajo del catálogo
            obliga a hacer scroll para cobrar, que es el gesto más repetido. */}
        <div
          className={cn(
            'flex-col justify-between rounded-lg border border-border bg-card shadow-xs',
            isInDialog ? 'flex' : 'hidden md:flex',
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
                  <li
                    key={l.productId}
                    className="flex items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{l.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatArs(l.price * l.qty)}
                      </p>
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
                      <span className="w-6 text-center text-sm font-semibold tabular-nums">
                        {l.qty}
                      </span>
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
              {methodChips}
            </fieldset>
            {error && (
              <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={isPending || lines.length === 0}
              className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isPending ? 'Cobrando…' : `Cobrar ${formatArs(total)}`}
            </button>
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
      </div>

      {/* Barra de cobro del teléfono: aparece recién cuando hay algo que cobrar,
          pegada arriba de la barra de navegación inferior. Nada se mueve de
          lugar al tocar el primer producto — la barra entra en un espacio que
          antes no ocupaba nadie. */}
      {!isInDialog && lines.length > 0 && (
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-3 space-y-2 border-t border-border bg-card px-4 pb-3 pt-2.5 shadow-[0_-8px_24px_-12px_rgba(2,6,23,.25)] md:hidden">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm text-muted-foreground">
              {count} {count === 1 ? 'ítem' : 'ítems'} ·{' '}
              {lines.map((l) => `${l.name} ×${l.qty}`).join(', ')}
            </p>
            <button
              type="button"
              onClick={() => setLines([])}
              disabled={isPending}
              className="h-11 shrink-0 px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              Vaciar
            </button>
          </div>
          <fieldset>
            <legend className="sr-only">Método de pago</legend>
            {methodChips}
          </fieldset>
          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="h-12 rounded-md bg-primary text-base font-semibold tabular-nums text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isPending ? 'Cobrando…' : `Cobrar ${formatArs(total)}`}
            </button>
            {createTabAction && (
              <button
                type="button"
                onClick={() => setTabDialogOpen(true)}
                disabled={isPending}
                className="h-12 rounded-md border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                Fiado
              </button>
            )}
          </div>
        </div>
      )}

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
    </>
  )
}

function StockChip({ badge }: { badge: StockBadge }) {
  return (
    <span className={`text-[11px] font-medium ${stockBadgeToneClass(badge.tone)}`}>
      {badge.label}
    </span>
  )
}
