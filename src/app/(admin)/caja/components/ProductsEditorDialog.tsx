'use client'

import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CanteenProductsActionResult } from '../actions'
import { toast } from '@/hooks/use-toast'
import type { CanteenProduct } from '@/modules/tenants/tenant.types'

/**
 * saveCanteenProductsAction llega por PROP, mismo motivo que
 * createCashFlowAction (ver RegisterMovementModal.tsx): '../actions' es
 * `'use server'` y arrastra drizzle/postgres a cualquier bundle de browser.
 */
export type SaveCanteenProductsAction = (
  products: { id: string; name: string; price: number; stock?: number }[],
) => Promise<CanteenProductsActionResult>

// Sugerencias para el primer uso: el admin ajusta nombres y precios antes de guardar.
const SUGGESTED: Array<{ name: string; pricePesos: string }> = [
  { name: 'Agua', pricePesos: '1500' },
  { name: 'Gatorade', pricePesos: '2500' },
  { name: 'Cerveza', pricePesos: '3500' },
]

type EditorRow = { id: string; name: string; pricePesos: string; stock: string }

export function ProductsEditorDialog({
  open,
  products,
  onClose,
  onSaved,
  saveCanteenProductsAction,
}: {
  open: boolean
  products: CanteenProduct[]
  onClose: () => void
  onSaved: () => void
  saveCanteenProductsAction: SaveCanteenProductsAction
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<EditorRow[] | null>(null)

  // Las filas se inicializan desde props al abrir (estado derivado perezoso).
  const editing: EditorRow[] =
    rows ??
    products.map((p) => ({
      id: p.id,
      name: p.name,
      pricePesos: String(p.price / 100),
      stock: p.stock === undefined ? '' : String(p.stock),
    }))

  function update(id: string, patch: Partial<EditorRow>) {
    setRows(editing.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function addRow(name = '', pricePesos = '') {
    setRows([...editing, { id: crypto.randomUUID(), name, pricePesos, stock: '' }])
  }

  function loadSuggested() {
    setRows(
      SUGGESTED.map((s) => ({ id: crypto.randomUUID(), name: s.name, pricePesos: s.pricePesos, stock: '' })),
    )
  }

  function handleClose(next: boolean) {
    if (isPending) return
    if (!next) {
      setRows(null)
      setError(null)
      onClose()
    }
  }

  function save() {
    setError(null)
    const cleaned = editing.filter((r) => r.name.trim() !== '' || r.pricePesos.trim() !== '')
    for (const r of cleaned) {
      const pesos = Number(r.pricePesos)
      if (r.name.trim() === '') { setError('Hay un producto sin nombre.'); return }
      if (!Number.isFinite(pesos) || pesos <= 0) {
        setError(`Precio inválido para "${r.name.trim()}".`)
        return
      }
      if (r.stock.trim() !== '') {
        const s = Number(r.stock)
        if (!Number.isInteger(s) || s < 0) {
          setError(`Stock inválido para "${r.name.trim()}".`)
          return
        }
      }
    }
    const payload = cleaned.map((r) => {
      const item: { id: string; name: string; price: number; stock?: number } = {
        id: r.id,
        name: r.name.trim(),
        price: Math.round(Number(r.pricePesos) * 100),
      }
      if (r.stock.trim() !== '') item.stock = Number(r.stock)
      return item
    })
    startTransition(async () => {
      try {
        const res = await saveCanteenProductsAction(payload)
        if (res.success) {
          toast({ title: 'Productos guardados', variant: 'success' })
          setRows(null)
          onSaved()
          onClose()
        } else {
          setError(res.error)
        }
      } catch (err) {
        Sentry.captureException(err)
        setError('No pudimos guardar los productos. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Productos de cantina</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Cada producto se vende con un toque desde la caja. El precio es por unidad, en pesos. El stock es opcional: dejalo vacío si no querés controlarlo.
          </p>
          {editing.length === 0 ? (
            <button
              type="button"
              onClick={loadSuggested}
              className="h-11 w-full rounded-md border border-dashed border-border text-sm font-medium text-muted-foreground hover:border-emerald-400 hover:text-emerald-700 transition-colors"
            >
              Cargar sugeridos (Agua, Gatorade, Cerveza)
            </button>
          ) : (
            <ul className="space-y-2">
              {editing.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={r.name}
                    onChange={(e) => update(r.id, { name: e.target.value })}
                    placeholder="Producto"
                    aria-label="Nombre del producto"
                    className="h-11 min-w-0 flex-1 rounded-md border border-border px-3 text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={r.pricePesos}
                    onChange={(e) => update(r.id, { pricePesos: e.target.value })}
                    placeholder="Precio"
                    aria-label="Precio en pesos"
                    className="h-11 w-20 rounded-md border border-border px-3 text-sm tabular-nums"
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={r.stock}
                    onChange={(e) => update(r.id, { stock: e.target.value })}
                    placeholder="Stock"
                    aria-label="Stock (opcional)"
                    className="h-11 w-16 rounded-md border border-border px-2 text-sm tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => setRows(editing.filter((x) => x.id !== r.id))}
                    aria-label={`Eliminar ${r.name.trim() || 'producto'}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {editing.length > 0 && editing.length < 24 && (
            <button
              type="button"
              onClick={() => addRow()}
              className="h-11 w-full rounded-md border border-dashed border-border text-sm font-medium text-muted-foreground hover:border-emerald-400 hover:text-emerald-700 transition-colors"
            >
              + Agregar producto
            </button>
          )}
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleClose(false)}
              className="h-11 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={save}
              className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
