'use client'

import { useState } from 'react'
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
import { ResponsiveList } from '@/components/ui/responsive-list'
import { formatArs } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { canteenStockBadge, stockBadgeToneClass, type StockBadge } from '../caja-lib'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import {
  ProductFormDialog,
  type CreateProductAction,
  type UpdateProductAction,
} from './ProductFormDialog'
import { StockEntryDialog, type RegisterPurchaseAction } from './StockEntryDialog'
import { StockExitDialog, type RegisterStockExitAction } from './StockExitDialog'
import type { ProductActionResult } from './actions'

/** deactivateProductAction llega por PROP: '../actions' es `'use server'`. */
type DeactivateProductAction = (productId: string) => Promise<ProductActionResult>

type Props = {
  products: CanteenProductRow[]
  /** Solo admin edita catálogo (alta/edición/pausa); manager solo repone/da salida. */
  canEditCatalog: boolean
  createProductAction: CreateProductAction
  updateProductAction: UpdateProductAction
  deactivateProductAction: DeactivateProductAction
  registerPurchaseAction: RegisterPurchaseAction
  registerStockExitAction: RegisterStockExitAction
}

/**
 * Pausados al final y en gris: siguen existiendo (se reactivan desde el menú de
 * la fila) pero no compiten con lo que se vende. Orden estable dentro de cada
 * grupo — respeta el que trae `listProducts`.
 */
function activeFirst(products: CanteenProductRow[]): CanteenProductRow[] {
  return [...products].sort((a, b) => Number(b.isActive) - Number(a.isActive))
}

/** Clases del botón "Reponer" — resaltado cuando el stock exige acción. */
function reponerClass(tone: StockBadge['tone'] | null): string {
  const base = 'inline-flex items-center rounded-md px-2.5 text-xs font-medium'
  return tone === 'out' || tone === 'low'
    ? `${base} border border-emerald-600 bg-primary/10 text-emerald-800 hover:bg-primary/15 dark:border-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300`
    : `${base} text-emerald-700 hover:bg-accent dark:text-emerald-400`
}

function StockCell({ badge }: { badge: StockBadge | null }) {
  if (!badge)
    return <span className="text-xs text-muted-foreground">Sin control (Servicio / Alquiler)</span>
  return (
    <span className={`text-xs font-medium ${stockBadgeToneClass(badge.tone)}`}>{badge.label}</span>
  )
}

export function ProductsTable({
  products,
  canEditCatalog,
  createProductAction,
  updateProductAction,
  deactivateProductAction,
  registerPurchaseAction,
  registerStockExitAction,
}: Props) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CanteenProductRow | null>(null)
  const [entryProduct, setEntryProduct] = useState<CanteenProductRow | null>(null)
  const [exitProduct, setExitProduct] = useState<CanteenProductRow | null>(null)

  const ordered = activeFirst(products)

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

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-medium text-foreground">Catálogo</h2>
        {canEditCatalog ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-accent dark:text-emerald-400"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar producto
          </button>
        ) : (
          // Bloqueado por rol: candado, no desaparición (mismo criterio que
          // torneos/page.tsx y CorteZonasCard.tsx — MASTER CHK-admin §12).
          <span
            className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground"
            title="Solo el dueño puede agregar productos"
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            Agregar producto
            <span className="sr-only">— solo el dueño puede hacerlo</span>
          </span>
        )}
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Todavía no cargaste productos"
          description="Cargá tus productos (agua, gatorade, cerveza…) para venderlos con un toque desde Cantina."
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
              // que el header de arriba).
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
        <ResponsiveList
          cards={
            <ul className="divide-y divide-border">
              {ordered.map((p) => {
                const badge = canteenStockBadge(p.stock, p.minStock)
                return (
                  <li
                    key={p.id}
                    className={`flex items-center justify-between gap-3 px-4 py-3 ${
                      badge?.tone === 'out' ? 'bg-red-50 dark:bg-red-500/10' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p
                        className={`truncate text-sm font-medium ${
                          p.isActive ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {p.name}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatArs(p.price)}
                        {badge ? ' · ' : ''}
                        {badge && (
                          <span className={`font-medium ${stockBadgeToneClass(badge.tone)}`}>
                            {badge.label}
                          </span>
                        )}
                        {!p.isActive ? ' · Pausado' : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEntryProduct(p)}
                        className={`h-11 ${reponerClass(badge?.tone ?? null)}`}
                      >
                        Reponer
                      </button>
                      {canEditCatalog && (
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="inline-flex h-11 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          Editar
                        </button>
                      )}
                      <ProductRowMenu
                        product={p}
                        canEditCatalog={canEditCatalog}
                        onExit={setExitProduct}
                        onTogglePause={togglePause}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          }
          table={
            <table className="w-full min-w-[460px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-2.5 pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Producto
                  </th>
                  <th className="p-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Precio
                  </th>
                  <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Stock
                  </th>
                  <th className="p-2.5 pr-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ordered.map((p) => {
                  const badge = canteenStockBadge(p.stock, p.minStock)
                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors hover:bg-accent/50 ${
                        badge?.tone === 'out' ? 'bg-red-50 dark:bg-red-500/10' : ''
                      }`}
                    >
                      <td
                        className={`p-2.5 pl-4 font-medium ${
                          p.isActive ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {p.name}
                        {!p.isActive && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            (pausado)
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-foreground">
                        {formatArs(p.price)}
                      </td>
                      <td className="p-2.5">
                        <StockCell badge={badge} />
                      </td>
                      <td className="p-2.5 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Reponer y Editar a la vista: son las dos acciones de la
                              visita semanal, y esconderlas en un menú "..." obliga a
                              recordar dónde estaban (Nielsen #6). Lo que exige acción
                              —stock bajo o agotado— resalta el botón que la resuelve. */}
                          <button
                            type="button"
                            onClick={() => setEntryProduct(p)}
                            className={`h-11 md:h-9 ${reponerClass(badge?.tone ?? null)}`}
                          >
                            Reponer
                          </button>
                          {canEditCatalog && (
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              className="inline-flex h-11 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground md:h-9"
                            >
                              Editar
                            </button>
                          )}
                          <ProductRowMenu
                            product={p}
                            canEditCatalog={canEditCatalog}
                            onExit={setExitProduct}
                            onTogglePause={togglePause}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          }
        />
      )}

      <ProductFormDialog
        open={formOpen}
        product={editing}
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
    </div>
  )
}

/**
 * Lo ocasional y nada más: dar de baja stock (merma, cortesía, consumo) y
 * pausar el producto. Reponer y Editar salieron de acá y viven en la fila —
 * son las dos acciones de la visita semanal y esconderlas obligaba a recordar
 * dónde estaban.
 */
function ProductRowMenu({
  product,
  canEditCatalog,
  onExit,
  onTogglePause,
}: {
  product: CanteenProductRow
  canEditCatalog: boolean
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
