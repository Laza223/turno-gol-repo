'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Package, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { ResponsiveList } from '@/components/ui/responsive-list'
import { formatArs } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { canteenStockBadge, type StockBadge } from '../caja-lib'
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
export type DeactivateProductAction = (productId: string) => Promise<ProductActionResult>

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

/** "$X · 45%" — margen = (precio − costo) / precio. null si no hay costo cargado. */
function marginLabel(price: number, cost: number | null): string | null {
  if (cost == null) return null
  const margin = price > 0 ? Math.round(((price - cost) / price) * 100) : 0
  return `${formatArs(cost)} · ${margin}%`
}

function StockCell({ badge }: { badge: StockBadge | null }) {
  if (!badge) return <span className="text-xs text-muted-foreground">Sin control</span>
  const tone =
    badge.tone === 'out'
      ? 'text-red-600 dark:text-red-400'
      : badge.tone === 'low'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground'
  return <span className={`text-xs font-medium ${tone}`}>{badge.label}</span>
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        isActive
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30'
          : 'bg-muted text-muted-foreground ring-slate-500/20'
      }`}
    >
      {isActive ? 'Activo' : 'Pausado'}
    </span>
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
        {canEditCatalog && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-accent dark:text-emerald-400"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar producto
          </button>
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
            ) : undefined
          }
        />
      ) : (
        <ResponsiveList
          cards={
            <ul className="divide-y divide-border">
              {products.map((p) => {
                const badge = canteenStockBadge(p.stock, p.minStock)
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatArs(p.price)}
                        {badge ? ` · ${badge.label}` : ''}
                        {!p.isActive ? ' · Pausado' : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEntryProduct(p)}
                        className="inline-flex h-11 items-center rounded-md px-2.5 text-xs font-medium text-emerald-700 hover:bg-accent dark:text-emerald-400"
                      >
                        Reponer
                      </button>
                      <ProductRowMenu
                        product={p}
                        canEditCatalog={canEditCatalog}
                        onEdit={openEdit}
                        onEntry={setEntryProduct}
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
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-2.5 pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Nombre
                  </th>
                  <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Precio
                  </th>
                  <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Costo · margen
                  </th>
                  <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Stock
                  </th>
                  <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Estado
                  </th>
                  <th className="p-2.5 pr-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((p) => {
                  const badge = canteenStockBadge(p.stock, p.minStock)
                  const margin = marginLabel(p.price, p.cost)
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-accent/50">
                      <td className="p-2.5 pl-4 font-medium text-foreground">{p.name}</td>
                      <td className="p-2.5 tabular-nums text-foreground">{formatArs(p.price)}</td>
                      <td className="p-2.5 tabular-nums text-muted-foreground">{margin ?? '—'}</td>
                      <td className="p-2.5">
                        <StockCell badge={badge} />
                      </td>
                      <td className="p-2.5">
                        <StatusBadge isActive={p.isActive} />
                      </td>
                      <td className="p-2.5 pr-4 text-right">
                        <ProductRowMenu
                          product={p}
                          canEditCatalog={canEditCatalog}
                          onEdit={openEdit}
                          onEntry={setEntryProduct}
                          onExit={setExitProduct}
                          onTogglePause={togglePause}
                        />
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

function ProductRowMenu({
  product,
  canEditCatalog,
  onEdit,
  onEntry,
  onExit,
  onTogglePause,
}: {
  product: CanteenProductRow
  canEditCatalog: boolean
  onEdit: (p: CanteenProductRow) => void
  onEntry: (p: CanteenProductRow) => void
  onExit: (p: CanteenProductRow) => void
  onTogglePause: (p: CanteenProductRow) => void
}) {
  return (
    // modal={false}: menú de acciones sobre la fila, no un diálogo que deba
    // bloquear la página (mismo criterio que StaffActions.tsx).
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Opciones para ${product.name}`}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="cursor-pointer" onSelect={() => onEntry(product)}>
          Reponer
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" onSelect={() => onExit(product)}>
          Salida
        </DropdownMenuItem>
        {canEditCatalog && (
          <>
            <DropdownMenuItem className="cursor-pointer" onSelect={() => onEdit(product)}>
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onSelect={() => onTogglePause(product)}>
              {product.isActive ? 'Pausar' : 'Reactivar'}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
