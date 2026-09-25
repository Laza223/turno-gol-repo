'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PaymentMethodChips } from '@/components/ui/payment-method-chips'
import {
  chipClass,
  canteenStockBadge,
  stockBadgeToneClass,
  METHOD_OPTIONS,
  type StockBadge,
} from '../caja-lib'
import { formatArs } from '@/lib/format'
import { normalizeForSearch } from '@/lib/search'
import { cn } from '@/lib/utils'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import type { CreateTabActionResult } from './actions'
import { decrementLine, incrementLine, maxQtyFor, removeLine } from './ticket-lib'
import { TabDialog } from './TabDialog'
import { useTicketSale, type SellTicketAction } from './use-ticket-sale'

export type { SellTicketAction } from './use-ticket-sale'

export type CreateTabAction = (input: {
  debtorName: string
  lines: { productId: string; qty: number }[]
  clientIdempotencyKey: string
}) => Promise<CreateTabActionResult>

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

/**
 * Dónde vive el ticket, que decide la forma y nada más — la venta es la misma
 * (`useTicketSale`, que también usa el modal de Vender de Hoy):
 *  - `page`: la pantalla Vender de /caja. Catálogo y ticket lado a lado desde
 *    `md`, ticket `sticky` en `lg`, y en el teléfono una barra de cobro pegada
 *    abajo.
 *  - `dialog`: adentro de un diálogo (la cantina de un turno). Foco a cargo de
 *    Radix, catálogo con techo propio.
 */
type TicketLayout = 'page' | 'dialog'

/**
 * Scroll interno de los renglones del ticket: barra fina en el gris del texto
 * secundario. La barra clásica de Windows, con sus dos flechas, parecía un
 * control roto.
 */
const THIN_SCROLLBAR =
  'scrollbar-thin scrollbar-thumb-muted-foreground/45 scrollbar-track-transparent'

export function TicketPanel({
  products,
  sellTicketAction,
  createTabAction,
  layout = 'page',
  onUnconfirmedChange,
}: {
  products: CanteenProductRow[]
  sellTicketAction: SellTicketAction
  createTabAction?: CreateTabAction
  layout?: TicketLayout
  /**
   * Avisa cuando hay una venta en vuelo, o una venta o un fiado que salió y cuya
   * respuesta no volvió (no se sabe si entró). Quien monta el ticket adentro de algo
   * que se puede cerrar lo usa para no cerrarlo: el estado de reintento y su clave
   * viven acá, y desmontar el ticket los pierde — al reabrir, cobrar de nuevo
   * duplicaría venta, stock y caja.
   *
   * El "en vuelo" no es un extra: el aviso de reintento sale en una transición y este
   * effect le avisa al diálogo recién un par de tareas DESPUÉS de pintarlo. Si el aviso
   * pasara de false a true en ese commit, un Esc en el hueco cerraba igual. Como la
   * venta ya estaba trabada desde el click (`isPending`), el valor no cambia y no hay
   * hueco.
   */
  /** Ver `useTicketSale`: con una venta sin confirmar, quien aloja el ticket no se cierra. */
  onUnconfirmedChange?: (unconfirmed: boolean) => void
}) {
  // Un id por instancia: en la Grilla puede haber dos tickets en el DOM a la vez, y
  // dos `id` iguales rompen la asociación del buscador.
  const searchId = useId()
  const isInDialog = layout === 'dialog'
  const isPage = layout === 'page'
  // Adentro de un diálogo el ticket es una sección de ese diálogo.
  const TicketHeading = isPage ? 'h2' : 'h3'
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<GroupFilter>('all')
  const {
    lines,
    setLines,
    method,
    setMethod,
    total,
    count,
    message,
    isPending,
    locked,
    saleRetry,
    tabRetry,
    tab,
    add: handleAdd,
    charge: handleCharge,
    chargeLabel,
    tabDialogOpen,
    setTabDialogOpen,
    onTabSuccess: handleTabSuccess,
  } = useTicketSale({ sellTicketAction, onUnconfirmedChange, onSold: () => setQuery('') })
  const searchRef = useRef<HTMLInputElement>(null)

  // Foco automático SOLO con mouse y teclado. Un `autoFocus` pelado abre el
  // teclado del teléfono apenas entrás y tapa medio catálogo, justo en la
  // pantalla que se usa de pie y tocando. Quien tiene teclado ya está escribiendo.
  useEffect(() => {
    if (!isPage) return // en un diálogo el foco lo maneja Radix
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: fine)').matches) return
    searchRef.current?.focus()
  }, [isPage])

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

  /** Enter en el buscador agrega el primer resultado disponible y limpia. */
  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const first = visible.find((p) => canteenStockBadge(p.stock, p.minStock)?.tone !== 'out')
    if (!first) return
    handleAdd(first)
    setQuery('')
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

  // El chip de método de pago del sistema (`PaymentMethodChips`, DESIGN.md §Chips):
  // el mismo que el alta de un turno y los movimientos de caja.
  const methodChips = (
    <PaymentMethodChips
      aria-label="Método de pago"
      value={method}
      onValueChange={setMethod}
      options={METHOD_OPTIONS}
      disabled={locked}
      className="grid grid-cols-3 gap-2"
    />
  )

  const alert = message ? (
    <p role="alert" className="text-xs text-red-700 dark:text-red-400">
      {message}
    </p>
  ) : null

  return (
    <>
      <div className="grid gap-4 md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-3">
          {/* Buscador SIEMPRE, no a partir de 13 productos: con el foco puesto
              acá se vende sin tocar el mouse (escribir + Enter), que es lo que
              separa una caja registradora de una grilla de botones. Con catálogo
              chico no estorba: filtra la lista de abajo, no abre nada. */}
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                ref={searchRef}
                id={searchId}
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
            <div className="flex shrink-0 gap-2" role="group" aria-label="Filtrar el catálogo">
              {GROUP_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setGroup(f.value)}
                  aria-pressed={group === f.value}
                  className={cn(chipClass(group === f.value), 'flex-1')}
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
              isPage && 'lg:max-h-[max(12rem,calc(100dvh-35rem))] lg:overflow-y-auto',
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
                    {/* Cuántos hay en el ticket, pegado al nombre y solo si hay: una
                        columna fija vacía al final dejaba los precios flotando lejos
                        del borde derecho. */}
                    {line && (
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-800 dark:text-emerald-400">
                        {`×${line.qty}`}
                      </span>
                    )}
                    <StockCell badge={badge} />
                    <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-foreground sm:w-24">
                      {formatArs(p.price)}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* El ticket. En el diálogo va al costado.
            En el teléfono (`page`) lo reemplaza la barra pegada abajo: un panel
            apilado debajo del catálogo obliga a hacer scroll para cobrar.
            Vacío es UNA línea: sin métodos de pago ni un "Cobrar $ 0" apagado,
            que se leía como un botón roto y le quitaba alto al catálogo. */}
        <div
          className={cn(
            'flex flex-col rounded-xl border border-border',
            isPage && 'hidden md:flex lg:sticky lg:top-4 lg:self-start',
          )}
        >
          {lines.length === 0 ? (
            <div className="px-4 py-8">
              <p className="text-center text-sm text-muted-foreground">
                Buscá o tocá un producto para empezar
              </p>
              {alert && <div className="mt-2">{alert}</div>}
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border py-1.5 pl-4 pr-2">
                <TicketHeading className="text-sm font-semibold text-foreground">
                  Ticket{' '}
                  <span className="font-normal tabular-nums text-muted-foreground">
                    · {count} {count === 1 ? 'ítem' : 'ítems'}
                  </span>
                </TicketHeading>
                {/* En el teléfono (`page`) "Vaciar" ya vive en la barra pegada abajo. */}
                {!isPage && (
                  <button
                    type="button"
                    onClick={() => setLines([])}
                    disabled={locked}
                    className="h-11 shrink-0 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 md:h-9"
                  >
                    Vaciar
                  </button>
                )}
              </div>

              <ul
                className={cn(
                  THIN_SCROLLBAR,
                  'max-h-[260px] divide-y divide-border overflow-y-auto',
                )}
              >
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

              {/* Sin renglón de total aparte: el total va en el botón, que es donde se
                  lee al cobrar ("Cobrar $ 13.500"), y el conteo va en el título. */}
              <div className="shrink-0 space-y-2.5 border-t border-border p-4">
                {methodChips}
                {alert}
                <button
                  type="button"
                  onClick={handleCharge}
                  disabled={isPending || tabRetry !== null}
                  className="h-12 w-full rounded-lg bg-primary text-base font-semibold tabular-nums text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  {chargeLabel}
                </button>
                {/* El fiado es de cada tanto (7 en 8 días en el Vagón): va como acción
                    secundaria, sin borde, así el único botón que se ve es Cobrar. */}
                {createTabAction && (
                  <button
                    type="button"
                    onClick={() => setTabDialogOpen(true)}
                    disabled={isPending || saleRetry !== null}
                    className="h-11 w-full rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:h-10"
                  >
                    {tabRetry ? 'Reintentar fiado' : 'Anotar como fiado'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Barra de cobro del teléfono: aparece recién cuando hay algo que cobrar,
          pegada arriba de la barra de navegación inferior. Nada se mueve de
          lugar al tocar el primer producto — la barra entra en un espacio que
          antes no ocupaba nadie. */}
      {isPage && lines.length > 0 && (
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
 * El stock se muestra solo cuando AVISA algo: "Quedan 3" (ámbar) o "Agotado"
 * (rojo), siempre con texto y no solo con color (MASTER §10). El "Stock 296" de
 * cada fila no cambia ninguna venta y era la columna más ruidosa del catálogo:
 * el número completo sigue en Caja › Productos.
 */
function StockCell({ badge }: { badge: StockBadge | null }) {
  if (!badge || badge.tone === 'ok') return null
  return (
    <span className={cn('shrink-0 text-xs font-medium', stockBadgeToneClass(badge.tone))}>
      {badge.label}
    </span>
  )
}
