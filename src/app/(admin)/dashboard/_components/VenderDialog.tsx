'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus, Search, Star } from 'lucide-react'
import { DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PaymentMethodChips } from '@/components/ui/payment-method-chips'
import { formatArs } from '@/lib/format'
import { normalizeForSearch } from '@/lib/search'
import { cn } from '@/lib/utils'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import { canteenStockBadge, stockBadgeToneClass, METHOD_OPTIONS } from '@/app/(admin)/caja/caja-lib'
import type { CreateTabAction } from '@/app/(admin)/caja/cantina/TicketPanel'
import { TabDialog } from '@/app/(admin)/caja/cantina/TabDialog'
import {
  decrementLine,
  incrementLine,
  maxQtyFor,
  removeLine,
} from '@/app/(admin)/caja/cantina/ticket-lib'
import { useTicketSale, type SellTicketAction } from '@/app/(admin)/caja/cantina/use-ticket-sale'

const TOP = 'top'
const OTHER = 'other'
const ALL = 'all'

const THIN_SCROLLBAR =
  'scrollbar-thin scrollbar-thumb-muted-foreground/45 scrollbar-track-transparent'

type Section = { key: string; label: string; products: CanteenProductRow[] }

const byName = (a: CanteenProductRow, b: CanteenProductRow) => a.name.localeCompare(b.name, 'es')

/**
 * Los rubros del catálogo, en el orden en que se muestran: "Más vendidos" primero
 * (si hay ventas), después cada categoría en orden alfabético, "Otros" para lo que
 * no tiene categoría y "Todos" al final. Sin ninguna categoría cargada quedan solo
 * "Más vendidos" y "Todos": una columna de rubros vacía no orienta a nadie.
 */
function buildSections(products: CanteenProductRow[], topProductIds: string[]): Section[] {
  const sections: Section[] = []
  const byId = new Map(products.map((p) => [p.id, p]))
  const top = topProductIds.flatMap((id) => byId.get(id) ?? [])
  if (top.length > 0) sections.push({ key: TOP, label: 'Más vendidos', products: top })

  const groups = new Map<string, CanteenProductRow[]>()
  const loose: CanteenProductRow[] = []
  for (const p of products) {
    const category = p.category?.trim()
    if (!category) loose.push(p)
    else groups.set(category, [...(groups.get(category) ?? []), p])
  }
  for (const category of [...groups.keys()].sort((a, b) => a.localeCompare(b, 'es'))) {
    sections.push({
      key: `cat:${category}`,
      label: category,
      products: groups.get(category)!.sort(byName),
    })
  }
  if (groups.size > 0 && loose.length > 0) {
    sections.push({ key: OTHER, label: 'Otros', products: loose.sort(byName) })
  }
  sections.push({ key: ALL, label: 'Todos', products: [...products].sort(byName) })
  return sections
}

/**
 * El modal de Vender de Hoy (decisión del dueño, 2026-09-25): reemplaza a la columna
 * fija de la derecha, que le quitaba 380 px al tablero y obligaba a scrollear o tipear
 * cada producto. Rubros a la izquierda, la lista del rubro en el medio (renglones con
 * precio, no tarjetas: se comparan por nombre y precio) y la venta a la derecha.
 *
 * Se vende con el teclado sin tocar el mouse: el buscador tiene el foco, ↑↓ eligen,
 * Enter suma y F2 cobra. El buscador busca en TODO el catálogo, no en el rubro.
 *
 * La venta es la misma de Caja (`useTicketSale`): mismo stock, mismo fiado, mismo
 * reintento si la red se corta.
 */
export function VenderDialog({
  products,
  topProductIds,
  sellTicketAction,
  createTabAction,
  onUnconfirmedChange,
  onSold,
}: {
  products: CanteenProductRow[]
  /** Los más vendidos de los últimos 30 días, en orden (ver la página de Hoy). */
  topProductIds: string[]
  sellTicketAction: SellTicketAction
  createTabAction: CreateTabAction
  onUnconfirmedChange: (unconfirmed: boolean) => void
  onSold: () => void
}) {
  const router = useRouter()
  const searchId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const sale = useTicketSale({ sellTicketAction, onUnconfirmedChange, onSold })
  const { lines, setLines, locked } = sale

  const sections = buildSections(products, topProductIds)
  const [sectionKey, setSectionKey] = useState(sections[0]?.key ?? ALL)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const normalizedQuery = normalizeForSearch(query)
  const section = sections.find((s) => s.key === sectionKey) ?? sections[0]
  const list = normalizedQuery
    ? [...products].filter((p) => normalizeForSearch(p.name).includes(normalizedQuery)).sort(byName)
    : (section?.products ?? [])
  const activeIndex = Math.min(active, Math.max(0, list.length - 1))
  const heading = normalizedQuery ? 'Resultados' : (section?.label ?? 'Todos')

  const isOut = (p: CanteenProductRow) => canteenStockBadge(p.stock, p.minStock)?.tone === 'out'

  function moveActive(delta: number) {
    const next = Math.max(0, Math.min(list.length - 1, activeIndex + delta))
    setActive(next)
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${next}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      moveActive(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick =
        list[activeIndex] && !isOut(list[activeIndex])
          ? list[activeIndex]
          : list.find((p) => !isOut(p))
      if (!pick) return
      sale.add(pick)
      if (query) {
        setQuery('')
        setActive(0)
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'F2') {
      e.preventDefault()
      sale.charge()
    }
  }

  function selectSection(key: string) {
    setSectionKey(key)
    setQuery('')
    setActive(0)
  }

  if (products.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <DialogTitle className="mb-2">Vender</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Cargá tus productos (agua, gatorade, cerveza…) y registrá cada venta con un toque.
        </p>
        <button
          type="button"
          onClick={() => router.push('/caja/productos?configureCanteen=true')}
          className="mt-4 h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Configurar productos
        </button>
      </div>
    )
  }

  return (
    <div
      onKeyDown={handleKeyDown}
      className="flex h-full min-h-0 flex-col md:grid md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[184px_minmax(0,1fr)_360px]"
    >
      {/* Rubros: columna desde `lg`; debajo, una tira de chips arriba de la lista. */}
      <nav
        aria-label="Rubros"
        className="hidden min-h-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-muted/35 px-3 pt-5 pb-3 lg:flex dark:bg-white/[0.02]"
      >
        <DialogTitle className="px-2 pb-3 text-lg">Vender</DialogTitle>
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => selectSection(s.key)}
            aria-current={s.key === section?.key && !normalizedQuery ? 'true' : undefined}
            className={cn(
              'flex min-h-9 items-center justify-between gap-2 rounded-md px-2.5 text-left text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
              s.key === section?.key && !normalizedQuery
                ? 'bg-card font-semibold text-foreground shadow-sm dark:bg-white/10'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {s.key === TOP && (
                <Star className="h-3.5 w-3.5 shrink-0 fill-current text-amber-500" aria-hidden />
              )}
              <span className="truncate">{s.label}</span>
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">{s.products.length}</span>
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 space-y-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
          <p aria-hidden className="text-lg font-semibold lg:hidden">
            Vender
          </p>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Buscar en todo el catálogo"
              aria-label="Buscar producto o servicio. Flechas para elegir, Enter suma"
              aria-controls={`${searchId}-list`}
              className="pl-9"
            />
          </div>
          <div
            className={cn(
              THIN_SCROLLBAR,
              '-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 lg:hidden',
            )}
          >
            {sections.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => selectSection(s.key)}
                aria-pressed={s.key === section?.key && !normalizedQuery}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
                  s.key === section?.key && !normalizedQuery
                    ? 'border-primary bg-primary/5 text-foreground dark:bg-primary/10'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {s.key === TOP && (
                  <Star className="h-3 w-3 fill-current text-amber-500" aria-hidden />
                )}
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={listRef}
          id={`${searchId}-list`}
          data-testid="canteen-catalog"
          className={cn(THIN_SCROLLBAR, 'min-h-0 flex-1 overflow-y-auto px-2 pb-3 sm:px-3')}
        >
          <h3 className="px-3 pb-1.5 text-xs font-semibold text-muted-foreground">
            {heading} · {list.length}
          </h3>
          {list.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Ningún producto coincide con “{query}”.
            </p>
          ) : (
            list.map((p, i) => {
              const badge = canteenStockBadge(p.stock, p.minStock)
              const out = badge?.tone === 'out'
              const qty = lines.find((l) => l.productId === p.id)?.qty ?? 0
              return (
                <button
                  key={p.id}
                  type="button"
                  data-index={i}
                  onClick={() => {
                    setActive(i)
                    sale.add(p)
                  }}
                  disabled={out || locked}
                  className={cn(
                    'group flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:min-h-10',
                    i === activeIndex ? 'bg-accent' : 'hover:bg-accent/60',
                  )}
                >
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      qty > 0 ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {p.name}
                  </span>
                  {badge && badge.tone !== 'ok' && (
                    <span
                      className={cn(
                        'shrink-0 text-xs font-medium',
                        stockBadgeToneClass(badge.tone),
                      )}
                    >
                      {badge.label}
                    </span>
                  )}
                  <span className="shrink-0 tabular-nums">{formatArs(p.price)}</span>
                  <span
                    aria-hidden={qty === 0}
                    className={cn(
                      'grid h-6 min-w-6 shrink-0 place-items-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                      qty > 0
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground opacity-0 group-hover:opacity-100 group-disabled:opacity-0',
                    )}
                  >
                    {qty > 0 ? (
                      <>
                        {qty}
                        <span className="sr-only"> en la venta</span>
                      </>
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <p className="hidden shrink-0 items-center gap-4 border-t border-border px-5 py-2.5 text-xs text-muted-foreground md:flex">
          {[
            ['↑ ↓', 'elegir'],
            ['Enter', 'sumar'],
            ['F2', 'cobrar'],
            ['Esc', 'cerrar'],
          ].map(([key, label]) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-background px-1.5 py-px font-sans text-[11px] text-foreground">
                {key}
              </kbd>
              {label}
            </span>
          ))}
        </p>
      </div>

      {/* La venta en curso. */}
      <section
        aria-label="Venta"
        className="flex max-h-[45%] shrink-0 flex-col border-t border-border bg-muted/35 md:max-h-none md:min-h-0 md:border-t-0 md:border-l dark:bg-white/[0.02]"
      >
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 pr-12 pl-5 md:h-14">
          <h3 className="text-sm font-semibold">
            Venta{' '}
            <span className="font-normal tabular-nums text-muted-foreground">
              · {sale.count} {sale.count === 1 ? 'ítem' : 'ítems'}
            </span>
          </h3>
          {lines.length > 0 && (
            <button
              type="button"
              onClick={() => setLines([])}
              disabled={locked}
              className="h-8 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              Vaciar
            </button>
          )}
        </header>

        {lines.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted-foreground md:flex-1 md:pt-4 md:text-center">
            Elegí productos de la lista
          </p>
        ) : (
          <ul
            className={cn(
              THIN_SCROLLBAR,
              'min-h-0 flex-1 divide-y divide-border overflow-y-auto border-t border-border px-5',
            )}
          >
            {lines.map((l) => (
              <li key={l.productId} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {l.qty} × {formatArs(l.price)}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center rounded-md border border-border bg-background">
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) =>
                        l.qty === 1
                          ? removeLine(prev, l.productId)
                          : decrementLine(prev, l.productId),
                      )
                    }
                    disabled={locked}
                    aria-label={
                      l.qty === 1 ? `Quitar ${l.name} de la venta` : `Restar uno a ${l.name}`
                    }
                    className="grid h-8 w-8 place-items-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">
                    {l.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => incrementLine(prev, l.productId))}
                    disabled={locked || l.qty >= maxQtyFor(l.stock)}
                    aria-label={`Sumar uno a ${l.name}`}
                    className="grid h-8 w-8 place-items-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
                <span className="w-16 shrink-0 text-right text-sm font-medium tabular-nums">
                  {formatArs(l.price * l.qty)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="shrink-0 space-y-3 border-t border-border px-5 pt-3 pb-4 md:pt-4 md:pb-5">
          <div className="hidden items-baseline justify-between md:flex">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-display text-[28px] leading-none tabular-nums">
              {formatArs(sale.total)}
            </span>
          </div>
          <PaymentMethodChips
            aria-label="Método de pago"
            value={sale.method}
            onValueChange={sale.setMethod}
            options={METHOD_OPTIONS}
            disabled={locked}
            className="grid grid-cols-3 gap-2"
          />
          {sale.message && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {sale.message}
            </p>
          )}
          <button
            type="button"
            onClick={sale.charge}
            disabled={
              sale.isPending || sale.tabRetry !== null || (lines.length === 0 && !sale.saleRetry)
            }
            className="h-12 w-full rounded-lg bg-primary text-base font-semibold tabular-nums text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {lines.length === 0 && !sale.saleRetry ? 'Cobrar' : sale.chargeLabel}
          </button>
          <button
            type="button"
            onClick={() => sale.setTabDialogOpen(true)}
            disabled={
              sale.isPending || sale.saleRetry !== null || (lines.length === 0 && !sale.tabRetry)
            }
            className="h-9 w-full rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            {sale.tabRetry ? 'Reintentar fiado' : 'Anotar como fiado'}
          </button>
        </div>
      </section>

      <TabDialog
        open={sale.tabDialogOpen}
        onOpenChange={sale.setTabDialogOpen}
        lines={lines}
        total={sale.total}
        createTabAction={createTabAction}
        attempt={sale.tab}
        onSuccess={sale.onTabSuccess}
      />
    </div>
  )
}
