'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { chipClass, canteenStockBadge, stockBadgeToneClass, type StockBadge } from '../caja-lib'
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

/**
 * sellTicketAction/createTabAction llegan por PROP: './actions' (mismo
 * directorio) es `'use server'` y arrastra drizzle/postgres al bundle de
 * browser (mismo motivo que RegisterMovementModal). Reemplaza CanteenQuickSale
 * (Fase 3): la venta ahora es un ticket multi-ítem — tap suma producto, un
 * solo "Cobrar". Venta de 1 ítem sigue siendo 2 taps (tap producto + tap
 * Cobrar). Fase 4: el mismo ticket se puede anotar como fiado en vez de
 * cobrarlo — `createTabAction` es opcional para no romper los consumidores
 * que todavía no ofrecen fiado (venta rápida del dashboard, `isInDialog`).
 */
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

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'mercadopago', label: 'MercadoPago' },
] as const

type SaleMethod = (typeof METHOD_OPTIONS)[number]['value']

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
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Una key por ticket: se genera al agregar el primer ítem y se regenera
  // recién tras cobrar OK (mismo criterio anti doble-tap que CanteenQuickSale/Fix #55).
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)

  // Diálogo "Anotar como fiado": key de idempotencia PROPIA, distinta de la
  // del ticket cobrado (createTab y sellTicket son flujos separados).
  const [tabDialogOpen, setTabDialogOpen] = useState(false)
  const [debtorName, setDebtorName] = useState('')
  const [tabNote, setTabNote] = useState('')
  const [tabError, setTabError] = useState<string | null>(null)
  const [tabPending, startTabTransition] = useTransition()
  const [tabIdempotencyKey, setTabIdempotencyKey] = useState<string | null>(null)

  const total = ticketTotal(lines)

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

  function openTabDialog() {
    if (lines.length === 0) return
    setDebtorName('')
    setTabNote('')
    setTabError(null)
    setTabIdempotencyKey(crypto.randomUUID())
    setTabDialogOpen(true)
  }

  function handleTabDialogChange(next: boolean) {
    if (tabPending) return
    setTabDialogOpen(next)
  }

  function submitTab() {
    if (!createTabAction || lines.length === 0 || !tabIdempotencyKey) return
    const trimmedName = debtorName.trim()
    if (trimmedName === '') {
      setTabError('Poné un nombre para el fiado.')
      return
    }
    setTabError(null)
    startTabTransition(async () => {
      try {
        const res = await createTabAction({
          debtorName: trimmedName,
          lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
          note: tabNote.trim() || undefined,
          clientIdempotencyKey: tabIdempotencyKey,
        })
        if (res.success) {
          toast({ title: `Fiado anotado — ${res.debtorName}`, variant: 'success' })
          setLines([])
          setMethod('cash')
          setIdempotencyKey(null)
          setTabDialogOpen(false)
          router.refresh()
        } else {
          setTabError(res.error)
        }
      } catch (err) {
        Sentry.captureException(err)
        setTabError('No pudimos anotar el fiado. Revisá tu conexión e intentá de nuevo.')
      }
    })
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
    <div className={cn('grid gap-4', !isInDialog && 'lg:grid-cols-[1fr_360px]')}>
      <div className="grid content-start grid-cols-2 gap-2 rounded-lg border border-border bg-card p-4 shadow-xs sm:grid-cols-3 lg:grid-cols-4">
        {/* En la página, la tab "Productos y stock" ya está visible arriba; en el
            diálogo del dashboard no hay tabs — sin este atajo, editar el catálogo
            exigía cerrar y navegar por el sidebar (paridad con CanteenQuickSale). */}
        {isInDialog && (
          <div className="col-span-full -mb-1 flex justify-end">
            <button
              type="button"
              onClick={() => router.push('/caja/productos?configureCanteen=true')}
              className="mr-7 inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:mr-8"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Configurar
            </button>
          </div>
        )}
        {products.map((p) => {
          const badge = canteenStockBadge(p.stock, p.minStock)
          const out = badge?.tone === 'out'
          const line = lines.find((l) => l.productId === p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleAdd(p)}
              disabled={out || isPending}
              className="min-h-[56px] rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-emerald-400 hover:bg-primary/5 active:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:border-emerald-500 dark:hover:bg-emerald-500/10 dark:active:bg-emerald-500/15"
            >
              <span className="block truncate text-sm font-semibold text-foreground">{p.name}</span>
              <span className="block text-sm tabular-nums text-muted-foreground">{formatArs(p.price)}</span>
              {badge && <StockChip badge={badge} />}
              {line && (
                <span className="mt-1 inline-block rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-semibold text-white dark:bg-emerald-600">
                  ×{line.qty}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div
        className={cn(
          'rounded-lg border border-border bg-card shadow-xs',
          !isInDialog && 'lg:sticky lg:top-4 lg:self-start',
        )}
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-medium text-foreground">Ticket</h2>
        </div>

        {lines.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Tocá un producto para empezar
          </p>
        ) : (
          <ul className="divide-y divide-border">
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
                    className="flex h-11 w-11 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => incrementLine(prev, l.productId))}
                    disabled={isPending || l.qty >= maxQtyFor(l.stock)}
                    aria-label={`Sumar uno a ${l.name}`}
                    className="flex h-11 w-11 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-accent disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => removeLine(prev, l.productId))}
                    disabled={isPending}
                    aria-label={`Quitar ${l.name} del ticket`}
                    className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-red-600 disabled:opacity-40 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

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
            className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
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
              onClick={openTabDialog}
              disabled={isPending}
              className="h-11 w-full rounded-md border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              Anotar como fiado
            </button>
          )}
        </div>
      </div>

      {createTabAction && (
        <Dialog open={tabDialogOpen} onOpenChange={handleTabDialogChange}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Anotar fiado</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="tab-debtor-name">Nombre</Label>
                <Input
                  id="tab-debtor-name"
                  value={debtorName}
                  onChange={(e) => setDebtorName(e.target.value)}
                  placeholder="ej: Capitán equipo 22hs"
                  maxLength={80}
                  disabled={tabPending}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tab-note">Nota (opcional)</Label>
                <textarea
                  id="tab-note"
                  value={tabNote}
                  onChange={(e) => setTabNote(e.target.value)}
                  rows={2}
                  disabled={tabPending}
                  placeholder="ej: paga el sábado que viene"
                  className="min-h-11 w-full rounded-md border border-border px-3 py-2 text-sm"
                />
              </div>
              {tabError && (
                <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                  {tabError}
                </p>
              )}
              <button
                type="button"
                onClick={submitTab}
                disabled={tabPending}
                className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {tabPending ? 'Anotando…' : `Anotar fiado — ${formatArs(total)}`}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function StockChip({ badge }: { badge: StockBadge }) {
  return (
    <span className={`mt-0.5 block text-xs font-medium ${stockBadgeToneClass(badge.tone)}`}>
      {badge.label}
    </span>
  )
}
