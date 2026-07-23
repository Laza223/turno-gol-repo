'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { chipClass } from '../caja-lib'
import { relativeTimeEs } from '@/app/(admin)/metricas/dashboard-helpers'
import { formatArs } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import type { CanteenTabRow } from '@/modules/canteen/canteen.types'
import type { CancelTabActionResult, SettleTabActionResult } from './actions'

/**
 * settleTabAction/cancelTabAction llegan por PROP: './actions' es
 * `'use server'` y arrastra drizzle/postgres al bundle de browser (mismo
 * motivo que TicketPanel/RegisterMovementModal).
 */
export type SettleTabAction = (input: {
  tabId: string
  method: 'cash' | 'transfer' | 'mercadopago'
  clientIdempotencyKey: string
}) => Promise<SettleTabActionResult>

export type CancelTabAction = (input: { tabId: string; reason: string }) => Promise<CancelTabActionResult>

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'mercadopago', label: 'MercadoPago' },
] as const

type SettleMethod = (typeof METHOD_OPTIONS)[number]['value']

/**
 * Fiados abiertos (canteen_tabs, status='open'): se llenan al "Anotar como
 * fiado" en TicketPanel. El stock ya salió al entregar (createTab) — cobrar
 * acá solo mueve la caja (settleTab crea el cash_flow); anular devuelve el
 * stock (ajuste compensatorio) sin haber tocado la plata nunca.
 */
export function FiadosList({
  tabs,
  settleTabAction,
  cancelTabAction,
  settleDisabled,
}: {
  tabs: CanteenTabRow[]
  settleTabAction: SettleTabAction
  cancelTabAction: CancelTabAction
  settleDisabled: boolean
}) {
  const router = useRouter()
  // Instante fijo por render (mismo criterio que SystemPanel en
  // metricas/MetricsDashboard.tsx): evita que "hace X" cambie sin refresh.
  const [nowMs] = useState(() => Date.now())
  const [settlingTab, setSettlingTab] = useState<CanteenTabRow | null>(null)
  const [cancelingTab, setCancelingTab] = useState<CanteenTabRow | null>(null)

  function handleSettled() {
    setSettlingTab(null)
    router.refresh()
  }

  function handleCanceled() {
    setCancelingTab(null)
    router.refresh()
  }

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-medium text-foreground">Fiados pendientes</h2>
      </div>

      {tabs.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin fiados pendientes.</p>
      ) : (
        <ul className="divide-y divide-border">
          {tabs.map((tab) => (
            <li key={tab.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{tab.debtorName}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatArs(tab.totalAmount)} · {relativeTimeEs(tab.createdAt.toISOString(), nowMs)}
                </p>
                {tab.note && <p className="mt-0.5 truncate text-xs text-muted-foreground">{tab.note}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSettlingTab(tab)}
                  className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Cobrar
                </button>
                <button
                  type="button"
                  onClick={() => setCancelingTab(tab)}
                  className="h-11 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-red-600 dark:hover:text-red-400"
                >
                  Anular
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SettleTabDialog
        tab={settlingTab}
        settleDisabled={settleDisabled}
        onClose={() => setSettlingTab(null)}
        onSettled={handleSettled}
        settleTabAction={settleTabAction}
      />
      <CancelTabDialog
        tab={cancelingTab}
        onClose={() => setCancelingTab(null)}
        onCanceled={handleCanceled}
        cancelTabAction={cancelTabAction}
      />
    </div>
  )
}

function SettleTabDialog({
  tab,
  settleDisabled,
  onClose,
  onSettled,
  settleTabAction,
}: {
  tab: CanteenTabRow | null
  settleDisabled: boolean
  onClose: () => void
  onSettled: () => void
  settleTabAction: SettleTabAction
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [method, setMethod] = useState<SettleMethod>('cash')
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  // Se re-inicializa por fiado (mismo patrón que StockExitDialog): la key de
  // idempotencia es propia de cada apertura del diálogo.
  const [lastTabId, setLastTabId] = useState<string | null>(null)
  if (tab && tab.id !== lastTabId) {
    setLastTabId(tab.id)
    setMethod('cash')
    setError(null)
    setIdempotencyKey(crypto.randomUUID())
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return
    if (!next) {
      setLastTabId(null)
      onClose()
    }
  }

  function submit() {
    if (!tab) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await settleTabAction({
          tabId: tab.id,
          method,
          clientIdempotencyKey: idempotencyKey,
        })
        if (res.success) {
          toast({ title: `Fiado cobrado — ${tab.debtorName}`, variant: 'success' })
          setLastTabId(null)
          onSettled()
        } else {
          setError(res.error)
        }
      } catch (err) {
        Sentry.captureException(err)
        setError('No pudimos cobrar el fiado. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  return (
    <Dialog open={tab !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cobrar fiado — {tab?.debtorName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-foreground">Método de pago</legend>
            <div className="grid grid-cols-3 gap-2">
              {METHOD_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  disabled={isPending || settleDisabled}
                  aria-pressed={method === m.value}
                  className={chipClass(method === m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </fieldset>
          {settleDisabled && (
            <p className="text-xs text-muted-foreground">
              Caja cerrada — el cobro se habilita cuando la caja esté abierta.
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={isPending || settleDisabled}
            className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {isPending ? 'Cobrando…' : `Cobrar ${tab ? formatArs(tab.totalAmount) : ''}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CancelTabDialog({
  tab,
  onClose,
  onCanceled,
  cancelTabAction,
}: {
  tab: CanteenTabRow | null
  onClose: () => void
  onCanceled: () => void
  cancelTabAction: CancelTabAction
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const [lastTabId, setLastTabId] = useState<string | null>(null)
  if (tab && tab.id !== lastTabId) {
    setLastTabId(tab.id)
    setReason('')
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return
    if (!next) {
      setLastTabId(null)
      onClose()
    }
  }

  function submit() {
    if (!tab) return
    const trimmed = reason.trim()
    if (trimmed === '') {
      setError('Contá por qué se anula el fiado.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const res = await cancelTabAction({ tabId: tab.id, reason: trimmed })
        if (res.success) {
          toast({ title: 'Fiado anulado', variant: 'success' })
          setLastTabId(null)
          onCanceled()
        } else {
          setError(res.error)
        }
      } catch (err) {
        Sentry.captureException(err)
        setError('No pudimos anular el fiado. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  return (
    <Dialog open={tab !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Anular fiado — {tab?.debtorName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Devuelve el stock entregado. La plata nunca entró a la caja.
          </p>
          <div className="space-y-1">
            <Label htmlFor="tab-cancel-reason">Motivo</Label>
            <textarea
              id="tab-cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              disabled={isPending}
              placeholder="ej: se pagó en el momento, error de carga…"
              className="min-h-11 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="h-12 w-full rounded-md border border-red-600 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            {isPending ? 'Anulando…' : 'Confirmar anulación'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
