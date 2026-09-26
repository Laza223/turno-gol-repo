'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, MoreHorizontal, Package, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/ui/empty-state'
import { Pager } from '@/components/ui/pager'
import { ScrollRegion } from '@/components/ui/scroll-region'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { canteenStockBadge, stockBadgeToneClass } from '../caja-lib'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import {
  ProductFormDialog,
  type CreateProductAction,
  type UpdateProductAction,
} from './ProductFormDialog'
import { RestockList } from './RestockList'
import { StockEntryDialog, type RegisterPurchaseAction } from './StockEntryDialog'
import { StockExitDialog, type RegisterStockExitAction } from './StockExitDialog'
import type { ProductActionResult } from './actions'

/**
 * Productos por página. Los pausados no se borran nunca (`deactivateProduct` es
 * una baja lógica), así que el catálogo solo crece: sin techo, la lista empuja
 * el ledger de stock fuera de la vista. De a 40 el catálogo del piloto (30)
 * entra entero.
 */
const PAGE_SIZE = 40

/** deactivateProductAction llega por PROP: '../actions' es `'use server'`. */
type DeactivateProductAction = (productId: string) => Promise<ProductActionResult>

type Props = {
  products: CanteenProductRow[]
  /**
   * Unidades vendidas por producto en los últimos 7 días (del ranking de
   * ventas). Mide para cuántas noches alcanza lo que hay que reponer.
   */
  unitsLast7Days?: Record<string, number>
  /** Solo admin edita catálogo (alta/edición/pausa); manager solo repone/da salida. */
  canEditCatalog: boolean
  createProductAction: CreateProductAction
  updateProductAction: UpdateProductAction
  deactivateProductAction: DeactivateProductAction
  registerPurchaseAction: RegisterPurchaseAction
  registerStockExitAction: RegisterStockExitAction
  /** Lo que va al lado del catálogo desde `lg` ("Lo que más salió"), ya armado en el server. */
  aside?: ReactNode
}

/**
 * Pausados al final y en gris: siguen existiendo (se reactivan desde el menú de
 * la fila) pero no compiten con lo que se vende. Orden estable dentro de cada
 * grupo — respeta el que trae `listProducts`.
 */
function activeFirst(products: CanteenProductRow[]): CanteenProductRow[] {
  return [...products].sort((a, b) => Number(b.isActive) - Number(a.isActive))
}

/**
 * El stock en palabras: "Stock 252 · mín 100", "Quedan 55 · mín 60" en ámbar,
 * "Agotado" en rojo. Mismos rótulos y colores que el punto de la pestaña y la
 * venta en Hoy (`canteenStockBadge`).
 */
function StockText({ product }: { product: CanteenProductRow }) {
  const badge = canteenStockBadge(product.stock, product.minStock)
  if (!badge) return <span className="text-muted-foreground">No lleva stock</span>
  return (
    <span className="tabular-nums">
      <span
        className={
          badge.tone === 'ok'
            ? 'text-foreground'
            : cn('font-medium', stockBadgeToneClass(badge.tone))
        }
      >
        {badge.label}
      </span>
      {badge.tone !== 'out' && product.minStock != null && (
        <span className="text-muted-foreground"> · mín {product.minStock}</span>
      )}
    </span>
  )
}

/** Acciones visibles de la fila desde `md`: en el teléfono viven en el menú "⋯". */
const ROW_ACTION =
  'hidden h-9 items-center rounded-md px-2.5 text-xs font-medium hover:bg-accent md:inline-flex'

/**
 * Productos como tarjetas (variante "Reponer primero", elegida por el dueño el
 * 2026-09-26): arriba lo que hay que reponer, abajo el catálogo con lo que más
 * salió al lado. Es dueño de los diálogos (alta, edición, reposición y salida),
 * por eso arma también "Para reponer": su botón abre la misma reposición que
 * la fila del catálogo.
 */
export function ProductsTable({
  products,
  unitsLast7Days = {},
  canEditCatalog,
  createProductAction,
  updateProductAction,
  deactivateProductAction,
  registerPurchaseAction,
  registerStockExitAction,
  aside,
}: Props) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CanteenProductRow | null>(null)
  const [entryProduct, setEntryProduct] = useState<CanteenProductRow | null>(null)
  const [exitProduct, setExitProduct] = useState<CanteenProductRow | null>(null)

  const [page, setPage] = useState(0)
  const sectionRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const ordered = activeFirst(products)
  // Pausar el último producto de la última página la deja vacía: el clamp
  // muestra la anterior en vez de una tabla sin filas.
  const lastPage = Math.max(Math.ceil(ordered.length / PAGE_SIZE) - 1, 0)
  const current = Math.min(page, lastPage)
  const pageRows = ordered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  function changePage(next: number) {
    setPage(next)
    // El paginador queda abajo de la tabla: sin esto, cambiar de página deja la
    // vista al final de la página nueva.
    sectionRef.current?.scrollIntoView({ block: 'start' })
    // Y la lista, que scrollea adentro, arranca de arriba.
    listRef.current?.scrollTo({ top: 0 })
  }

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(p: CanteenProductRow) {
    setEditing(p)
    setFormOpen(true)
  }
  function closeForm() {
    setFormOpen(false)
    setEditing(null)
  }

  async function togglePause(p: CanteenProductRow) {
    const res = p.isActive
      ? await deactivateProductAction(p.id)
      : await updateProductAction({ productId: p.id, patch: { isActive: true } })
    if (res.success) {
      toast({ title: p.isActive ? 'Producto pausado' : 'Producto reactivado', variant: 'success' })
      router.refresh()
    } else {
      toast({ title: res.error, variant: 'destructive' })
    }
  }

  const activeCount = products.filter((p) => p.isActive).length
  // Sugerencias del datalist: categorías ya cargadas, sin duplicados, orden alfabético.
  const categorySuggestions = Array.from(
    new Set(products.map((p) => p.category).filter((c): c is string => c != null)),
  ).sort((a, b) => a.localeCompare(b))

  const addButton = canEditCatalog ? (
    <button
      type="button"
      onClick={openCreate}
      className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent md:h-9"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Agregar producto
    </button>
  ) : (
    // Bloqueado por rol: candado, no desaparición (mismo criterio que
    // torneos/page.tsx y CorteZonasCard.tsx — MASTER CHK-admin §12).
    <span
      className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground md:h-9"
      title="Solo el dueño puede agregar productos"
    >
      <Lock className="h-4 w-4" aria-hidden="true" />
      Agregar producto
      <span className="sr-only">— solo el dueño puede hacerlo</span>
    </span>
  )

  return (
    <>
      <RestockList
        products={products}
        unitsLast7Days={unitsLast7Days}
        onRestock={setEntryProduct}
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section
          ref={sectionRef}
          aria-labelledby="catalogo-titulo"
          className="card-premium overflow-hidden"
        >
          <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
            <h2 id="catalogo-titulo" className="text-base font-semibold text-foreground">
              Catálogo
              {products.length > 0 && (
                <>
                  {' '}
                  <span className="font-normal tabular-nums text-muted-foreground">
                    {activeCount}
                  </span>
                  <span className="sr-only"> {activeCount === 1 ? 'producto' : 'productos'}</span>
                </>
              )}
            </h2>
            {addButton}
          </header>

          {products.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Todavía no cargaste productos"
              description="Cargá tus productos (agua, gatorade, cerveza…) para venderlos con un toque desde Hoy."
              className="border-0 py-10"
              action={
                canEditCatalog ? (
                  <button
                    type="button"
                    onClick={openCreate}
                    className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Cargar el primero
                  </button>
                ) : (
                  // Bloqueado por rol: candado, no desaparición (mismo criterio
                  // que el encabezado).
                  <span
                    className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-muted-foreground"
                    title="Solo el dueño puede agregar productos"
                  >
                    <Lock className="h-4 w-4" aria-hidden="true" />
                    Cargar el primero
                    <span className="sr-only">— solo el dueño puede hacerlo</span>
                  </span>
                )
              }
            />
          ) : (
            <ScrollRegion ref={listRef} label="Productos del catálogo">
              <ul className="divide-y divide-border">
                {pageRows.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-1.5 sm:px-5">
                    {/* En el teléfono: nombre y stock en dos líneas, precio a la
                      derecha. Desde `md`, tres columnas alineadas. */}
                    <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-1 md:grid-cols-[minmax(0,1fr)_5.5rem_9rem]">
                      <p
                        className={cn(
                          'truncate text-sm font-medium',
                          p.isActive ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {p.name}
                        {p.category && (
                          <span className="font-normal text-muted-foreground"> · {p.category}</span>
                        )}
                      </p>
                      <p
                        className={cn(
                          'row-span-2 text-right text-sm tabular-nums md:row-span-1',
                          p.isActive ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {formatArs(p.price)}
                      </p>
                      {/* Un pausado no se vende: en vez del stock dice eso, sin
                        competir con el nombre por el ancho. */}
                      <p className="text-xs md:text-right md:text-sm">
                        {p.isActive ? (
                          <StockText product={p} />
                        ) : (
                          <span className="text-muted-foreground">Pausado</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {/* Reponer y Editar a la vista: son las dos acciones de la
                        visita semanal (Nielsen #6). Reponer sirve también para
                        un producto que no lleva stock: empieza a llevarlo. */}
                      <button
                        type="button"
                        onClick={() => setEntryProduct(p)}
                        className={cn(ROW_ACTION, 'text-emerald-800 dark:text-emerald-400')}
                      >
                        Reponer
                      </button>
                      {canEditCatalog && (
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className={cn(ROW_ACTION, 'text-muted-foreground hover:text-foreground')}
                        >
                          Editar
                        </button>
                      )}
                      <ProductRowMenu
                        product={p}
                        canEditCatalog={canEditCatalog}
                        onRestock={setEntryProduct}
                        onEdit={openEdit}
                        onExit={setExitProduct}
                        onTogglePause={togglePause}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollRegion>
          )}

          {ordered.length > PAGE_SIZE && (
            <div className="border-t border-border px-4 py-2 sm:px-5">
              <Pager
                label="Paginación del catálogo"
                page={current}
                total={ordered.length}
                pageSize={PAGE_SIZE}
                onPageChange={changePage}
              />
            </div>
          )}
        </section>

        {aside}
      </div>

      <ProductFormDialog
        open={formOpen}
        product={editing}
        categorySuggestions={categorySuggestions}
        onClose={closeForm}
        onSaved={() => router.refresh()}
        createProductAction={createProductAction}
        updateProductAction={updateProductAction}
      />
      <StockEntryDialog
        product={entryProduct}
        onClose={() => setEntryProduct(null)}
        onSaved={() => router.refresh()}
        registerPurchaseAction={registerPurchaseAction}
      />
      <StockExitDialog
        product={exitProduct}
        onClose={() => setExitProduct(null)}
        onSaved={() => router.refresh()}
        registerStockExitAction={registerStockExitAction}
      />
    </>
  )
}

/**
 * Lo ocasional: dar de baja stock (merma, cortesía, consumo) y pausar el
 * producto. Reponer y Editar viven en la fila desde `md` —son las dos acciones
 * de la visita semanal—; en el teléfono no entran al lado del nombre y se
 * suman acá arriba de todo.
 */
function ProductRowMenu({
  product,
  canEditCatalog,
  onRestock,
  onEdit,
  onExit,
  onTogglePause,
}: {
  product: CanteenProductRow
  canEditCatalog: boolean
  onRestock: (p: CanteenProductRow) => void
  onEdit: (p: CanteenProductRow) => void
  onExit: (p: CanteenProductRow) => void
  onTogglePause: (p: CanteenProductRow) => void
}) {
  return (
    // modal={false}: menú de acciones sobre la fila, no un diálogo que deba
    // bloquear la página (mismo criterio que StaffActions.tsx).
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Opciones para ${product.name}`}>
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Opciones</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="cursor-pointer md:hidden" onSelect={() => onRestock(product)}>
          Reponer
        </DropdownMenuItem>
        {canEditCatalog && (
          <DropdownMenuItem className="cursor-pointer md:hidden" onSelect={() => onEdit(product)}>
            Editar
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="cursor-pointer" onSelect={() => onExit(product)}>
          Salida de stock
        </DropdownMenuItem>
        {canEditCatalog && (
          <DropdownMenuItem className="cursor-pointer" onSelect={() => onTogglePause(product)}>
            {product.isActive ? 'Pausar' : 'Reactivar'}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
