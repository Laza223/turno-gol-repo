'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { formatArs } from '@/lib/format'
import { canteenStockBadge, type StockBadge } from '../caja-lib'
import { EmptyState } from '@/components/ui/empty-state'
import { ProductsEditorDialog, type SaveCanteenProductsAction } from '../components/ProductsEditorDialog'
import type { CanteenProduct } from '@/modules/tenants/tenant.types'

/**
 * Catálogo de productos de cantina (tab "Productos y stock"): lista read-only
 * + editor completo (ProductsEditorDialog, ex CanteenQuickSale) en un diálogo.
 * El botón "Configurar" de la tab Cantina navega acá con
 * `?configureCanteen=true` para abrir el editor de un tirón — mismo criterio
 * que antes, cuando el editor vivía inline en esa vista.
 */
export function ProductsManager({
  products,
  saveCanteenProductsAction,
}: {
  products: CanteenProduct[]
  saveCanteenProductsAction: SaveCanteenProductsAction
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [editorOpen, setEditorOpen] = useState(false)

  useEffect(() => {
    if (searchParams?.get('configureCanteen') === 'true') {
      setEditorOpen(true)
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname)
      }
    }
  }, [searchParams])

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-medium text-foreground">Productos de cantina</h2>
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Configurar productos
        </button>
      </div>
      {products.length === 0 ? (
        <EmptyState
          title="Todavía no cargaste productos"
          description="Cargá tus productos (agua, gatorade, cerveza…) para venderlos con un toque desde Cantina."
          action={
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Cargar productos
            </button>
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {products.map((p) => {
            const badge = canteenStockBadge(p.stock)
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                <div className="flex shrink-0 items-center gap-3">
                  {badge && <StockChip badge={badge} />}
                  <span className="text-sm tabular-nums text-muted-foreground">{formatArs(p.price)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <ProductsEditorDialog
        open={editorOpen}
        products={products}
        onClose={() => setEditorOpen(false)}
        onSaved={() => router.refresh()}
        saveCanteenProductsAction={saveCanteenProductsAction}
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
  return <span className={`text-xs font-medium ${tone}`}>{badge.label}</span>
}
