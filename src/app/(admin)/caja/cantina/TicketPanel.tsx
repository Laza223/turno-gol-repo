'use client'

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  chipClass,
  canteenStockBadge,
  stockBadgeToneClass,
  METHOD_OPTIONS,
  type SaleMethod,
  type StockBadge,
} from '../caja-lib'
import { formatArs } from '@/lib/format'
import { normalizeForSearch } from '@/lib/search'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useUnconfirmedSubmit } from '@/hooks/use-unconfirmed-submit'
import { unconfirmedMessage } from '@/components/admin/UnconfirmedRetry'
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
import { TabDialog, type TabAttempt } from './TabDialog'

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

/** Una venta que salió: lo que se reenvía si la respuesta no vuelve. */
type SaleAttempt = {
  lines: { productId: string; qty: number }[]
  method: SaleMethod
  total: number
}

type GroupFilter = 'all' | 'product' | 'service'

/**
 * El catálogo se agrupa por lo que la base YA distingue: `stock === null` es un
 * servicio o alquiler (sin límite de unidades), cualquier otra cosa es un
 * producto con stock. No hay columna de categoría y no se agregó una: con 3 a
 * 15 artículos, mantener una taxonomía cuesta más que buscar.
 */
const GROUP_FILTERS: { value: GroupFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'product', label: 'Productos' },
  { value: 'service', label: 'Servicios' },
]

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
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<GroupFilter>('all')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // La key de la venta y la del fiado (ver useUnconfirmedSubmit). Si una de las
  // dos quedó sin respuesta, esas líneas pueden ya estar registradas: el ticket
  // entero se traba hasta reintentar ESE envío.
  const sale = useUnconfirmedSubmit<SaleAttempt>()
  const tab = useUnconfirmedSubmit<TabAttempt>()
  const saleRetry = sale.retryPayload
  const tabRetry = tab.retryPayload
  const locked = isPending || saleRetry !== null || tabRetry !== null
  const [tabDialogOpen, setTabDialogOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Foco automático SOLO con mouse y teclado. Un `autoFocus` pelado abre el
  // teclado del teléfono apenas entrás y tapa medio catálogo, justo en la
  // pantalla que se usa de pie y tocando. Quien tiene teclado ya está escribiendo.
  useEffect(() => {
    if (isInDialog) return // adentro del diálogo el foco lo maneja Radix
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: fine)').matches) return
    searchRef.current?.focus()
  }, [isInDialog])

  const total = ticketTotal(lines)
  const count = ticketCount(lines)
  const message = saleRetry
    ? unconfirmedMessage(`la venta de ${formatArs(saleRetry.total)}`)
    : tabRetry
      ? unconfirmedMessage(`el fiado a nombre de ${tabRetry.debtorName}`)
      : error

  const hasProducts = products.some((p) => p.stock !== null)
  const hasServices = products.some((p) => p.stock === null)
  const showGroups = hasProducts && hasServices

  const normalizedQuery = normalizeForSearch(query)
  const visible = products.filter((p) => {
    if (group === 'product' && p.stock === null) return false
    if (group === 'service' && p.stock !== null) return false
    if (normalizedQuery && !normalizeForSearch(p.name).includes(normalizedQuery)) return false
    return true
  })

  function handleAdd(product: CanteenProductRow) {
    if (locked) return
    setError(null)
    setLines((prev) =>
      addProduct(prev, {
        id: product.id,
        name: product.name,
        price: product.price,
        stock: product.stock,
      }),
    )
  }

  /** Enter en el buscador agrega el primer resultado disponible y limpia. */
  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const first = visible.find((p) => canteenStockBadge(p.stock, p.minStock)?.tone !== 'out')
    if (!first) return
    handleAdd(first)
    setQuery('')
  }

  function submit() {
    if (lines.length === 0 || locked) return
    runSale({
      lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
      method,
      total,
    })
  }

  function runSale(payload: SaleAttempt) {
    setError(null)
    startTransition(async () => {
      const res = await sale.send(payload, (p, clientIdempotencyKey) =>
        sellTicketAction({ lines: p.lines, method: p.method, clientIdempotencyKey }),
      )
      if (!res) return
      if (res.success) {
        toast({ title: `Venta registrada — ${formatArs(res.total)}`, variant: 'success' })
        setLines([])
        setMethod('cash')
        setQuery('')
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  /** El botón de cobrar: con una venta sin respuesta, reintenta ESA. */
  function handleCharge() {
    if (saleRetry) runSale(saleRetry)
    else submit()
  }

  const chargeLabel = isPending
    ? 'Cobrando…'
    : saleRetry
      ? `Reintentar cobro de ${formatArs(saleRetry.total)}`
      : `Cobrar ${formatArs(total)}`

  function handleTabSuccess() {
    setLines([])
    setMethod('cash')
  }

  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-border px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          Cargá tus productos (agua, gatorade, cerveza…) y registrá cada venta con un toque.
        </p>
        <button
          type="button"
          onClick={() => router.push('/caja/productos?configureCanteen=true')}
          className="mt-3 h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
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
          disabled={locked}
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
        <div className="flex min-w-0 flex-col gap-3">
          {/* Buscador SIEMPRE, no a partir de 13 productos: con el foco puesto
              acá se vende sin tocar el mouse (escribir + Enter), que es lo que
              separa una caja registradora de una grilla de botones. Con catálogo
              chico no estorba: filtra la lista de abajo, no abre nada. */}
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                ref={searchRef}
                id="ticket-product-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar producto o servicio…"
                aria-label="Buscar producto o servicio. Enter agrega el primer resultado"
                className="pl-9"
              />
            </div>
            {isInDialog && (
              <button
                type="button"
                onClick={() => router.push('/caja/productos?configureCanteen=true')}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-10"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Configurar
              </button>
            )}
          </div>

          {showGroups && (
            <div
              className="flex gap-2 overflow-x-auto pb-1"
              role="group"
              aria-label="Filtrar el catálogo"
            >
              {GROUP_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setGroup(f.value)}
                  aria-pressed={group === f.value}
                  className={chipClass(group === f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* Filas, no tarjetas: el complejo tiene entre 3 y 15 artículos y los
              compara por nombre y precio, que es exactamente para lo que sirve
              una lista. El techo de alto es solo `lg`, donde el Ticket es una
              columna aparte y `sticky`: el catálogo scrollea adentro y la
              página no. El techo descuenta lo que Vender pone DEBAJO (aviso
              de fiados y últimos movimientos), medido a 1440×900. En teléfono
              no hay techo — el catálogo empujaba el botón de cobro fuera de
              pantalla, y por eso manda la barra pegada abajo (ver el final). */}
          <div
            data-testid="canteen-catalog"
            className={cn(
              'min-w-0 divide-y divide-border border-y border-border',
              !isInDialog && 'lg:max-h-[max(12rem,calc(100dvh-35rem))] lg:overflow-y-auto',
              isInDialog && 'max-h-[40vh] overflow-y-auto',
            )}
          >
            {visible.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Ningún producto coincide con “{query}”.
              </p>
            ) : (
              visible.map((p) => {
                const badge = canteenStockBadge(p.stock, p.minStock)
                const out = badge?.tone === 'out'
                const line = lines.find((l) => l.productId === p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleAdd(p)}
                    disabled={out || locked}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 px-2 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent md:min-h-10',
                      // Lo que ya está en el ticket se marca con fondo además
                      // del contador: el ×N solo no se ve de reojo mientras se
                      // toca rápido.
                      line && 'bg-primary/5',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {p.name}
                    </span>
                    <StockCell badge={badge} />
                    <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-foreground sm:w-24">
                      {formatArs(p.price)}
                    </span>
                    <span className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums text-emerald-800 dark:text-emerald-400">
                      {line ? `×${line.qty}` : ''}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* El ticket al costado es la vista de escritorio. En el teléfono lo
            reemplaza la barra pegada abajo: un panel apilado debajo del catálogo
            obliga a hacer scroll para cobrar, que es el gesto más repetido. */}
        <div
          className={cn(
            'flex-col justify-between rounded-xl border border-border',
            isInDialog ? 'flex' : 'hidden md:flex',
            !isInDialog && 'lg:sticky lg:top-4 lg:self-start',
          )}
        >
          <div>
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Ticket</h2>
            </div>

            {lines.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Buscá o tocá un producto para empezar
              </p>
            ) : (
              <ul className="max-h-[260px] divide-y divide-border overflow-y-auto">
                {lines.map((l) => (
                  <li
                    key={l.productId}
                    className="flex items-center justify-between gap-2 px-4 py-2.5"
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
                        disabled={locked}
                        aria-label={`Restar uno a ${l.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                      >
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums">
                        {l.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLines((prev) => incrementLine(prev, l.productId))}
                        disabled={locked || l.qty >= maxQtyFor(l.stock)}
                        aria-label={`Sumar uno a ${l.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setLines((prev) => removeLine(prev, l.productId))}
                        disabled={locked}
                        aria-label={`Quitar ${l.name} del ticket`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-red-600 disabled:opacity-40 dark:hover:text-red-400"
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
            {lines.length > 0 && (
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">
                  {count} {count === 1 ? 'ítem' : 'ítems'}
                </span>
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {formatArs(total)}
                </span>
              </div>
            )}
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-foreground">Método de pago</legend>
              {methodChips}
            </fieldset>
            {message && (
              <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                {message}
              </p>
            )}
            <button
              type="button"
              onClick={handleCharge}
              disabled={isPending || tabRetry !== null || lines.length === 0}
              className="h-12 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {chargeLabel}
            </button>
            {createTabAction && lines.length > 0 && (
              <button
                type="button"
                onClick={() => setTabDialogOpen(true)}
                disabled={isPending || saleRetry !== null}
                className="h-11 w-full rounded-lg border border-border text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                {tabRetry ? 'Reintentar fiado' : 'Anotar como fiado'}
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
              disabled={locked}
              className="h-11 shrink-0 px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              Vaciar
            </button>
          </div>
          <fieldset>
            <legend className="sr-only">Método de pago</legend>
            {methodChips}
          </fieldset>
          {message && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {message}
            </p>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              onClick={handleCharge}
              disabled={isPending || tabRetry !== null}
              className="h-12 rounded-lg bg-primary text-base font-semibold tabular-nums text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {chargeLabel}
            </button>
            {createTabAction && (
              <button
                type="button"
                onClick={() => setTabDialogOpen(true)}
                disabled={isPending || saleRetry !== null}
                className="h-12 rounded-lg border border-border text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                {tabRetry ? 'Reintentar fiado' : 'Fiado'}
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
          attempt={tab}
          onSuccess={handleTabSuccess}
        />
      )}
    </>
  )
}

/**
 * El estado de stock viaja con texto ("Agotado", "Quedan 3"), nunca solo con
 * color (MASTER §10). Sin control de stock la celda dice "Servicio" y no queda
 * vacía: una columna en blanco se lee como "falta el dato".
 */
function StockCell({ badge }: { badge: StockBadge | null }) {
  return (
    <span
      className={cn(
        'w-[4.5rem] shrink-0 truncate text-[11px] sm:w-24 sm:text-xs',
        badge ? stockBadgeToneClass(badge.tone) : 'text-muted-foreground',
      )}
    >
      {badge ? badge.label : 'Servicio'}
    </span>
  )
}
