'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  SplitPaymentFields,
  newChargeLine,
  type ChargeLine,
} from '@/components/admin/SplitPaymentFields'
import { relativeTimeEs } from '@/lib/format'
import { formatArs } from '@/lib/format'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/payment-method'
import { toast } from '@/hooks/use-toast'
import type { CanteenTabRow } from '@/modules/canteen/canteen.types'
import type { CancelTabActionResult, SettleTabActionResult } from './actions'

// Fiados no admiten 'other' (canteen.types.ts: CanteenSaleMethod excluye 'other').
const CANTEEN_METHOD_OPTIONS = PAYMENT_METHOD_OPTIONS.filter((m) => m.value !== 'other')

/**
 * settleTabAction/cancelTabAction llegan por PROP: './actions' es
 * `'use server'` y arrastra drizzle/postgres al bundle de browser (mismo
 * motivo que TicketPanel/RegisterMovementModal).
 */
export type SettleTabAction = (input: {
  tabId: string
  charges: { amount: number; method: 'cash' | 'transfer' | 'mercadopago' }[]
  clientIdempotencyKey: string
}) => Promise<SettleTabActionResult>

export type CancelTabAction = (input: {
  tabId: string
  reason: string
}) => Promise<CancelTabActionResult>

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
}: {
  tabs: CanteenTabRow[]
  settleTabAction: SettleTabAction
  cancelTabAction: CancelTabAction
}) {
  const router = useRouter()
  // Instante fijo por render (mismo criterio que SystemPanel en
  // analiticas/MetricsDashboard.tsx): evita que "hace X" cambie sin refresh.
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

  const pendingTotal = tabs.reduce((acc, t) => acc + t.totalAmount, 0)

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="font-medium text-foreground">Fiados abiertos</h2>
        {tabs.length > 0 && (
          <span className="text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-300">
            {tabs.length} · {formatArs(pendingTotal)}
          </span>
        )}
      </div>

      {tabs.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Nadie tiene fiado abierto.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {tabs.map((tab) => (
            <li key={tab.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{tab.debtorName}</p>
                {/* Sin `tab.note`: era texto libre sobre una persona y dejó de
                    pedirse al anotar el fiado (Ley 25.326). Las filas viejas la
                    conservan en la base; esta pantalla ya no la publica. */}
                <p className="text-xs text-muted-foreground">
                  {relativeTimeEs(tab.createdAt.toISOString(), nowMs)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {/* El monto va DENTRO del botón: cobrar un fiado es dos toques y
                    el primero no debería obligar a leer la fila para saber
                    cuánto se está por cobrar. */}
                <button
                  type="button"
                  onClick={() => setSettlingTab(tab)}
                  className="h-11 whitespace-nowrap rounded-md bg-primary px-3 text-sm font-semibold tabular-nums text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Cobrar {formatArs(tab.totalAmount)}
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
  onClose,
  onSettled,
  settleTabAction,
}: {
  tab: CanteenTabRow | null
  onClose: () => void
  onSettled: () => void
  settleTabAction: SettleTabAction
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<ChargeLine[]>([])
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  // Se re-inicializa por fiado (mismo patrón que StockExitDialog): la key de
  // idempotencia es propia de cada apertura del diálogo. Precarga una línea
  // con el total del ticket en efectivo — el atajo "Pagar todo en efectivo"
  // de SplitPaymentFields reproduce ese mismo estado inicial.
  const [lastTabId, setLastTabId] = useState<string | null>(null)
  if (tab && tab.id !== lastTabId) {
    setLastTabId(tab.id)
    setLines([newChargeLine(tab.totalAmount, 'cash')])
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

  /**
   * Corre la mutación real a partir de un array de cargos ya validado — la
   * sacamos de `submit` para que el atajo "Cobrar todo en efectivo" la pueda
   * invocar con un cargo armado en el momento, sin depender de `lines` (que
   * todavía no se actualizó por el `setLines` de ese mismo click).
   */
  function runCharge(charges: { amount: number; method: 'cash' | 'transfer' | 'mercadopago' }[]) {
    if (!tab) return
    startTransition(async () => {
      try {
        const res = await settleTabAction({
          tabId: tab.id,
          charges,
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

  function submit() {
    if (!tab) return
    setError(null)

    const charges: { amount: number; method: 'cash' | 'transfer' | 'mercadopago' }[] = []
    for (const l of lines) {
      if (l.amountCents == null || l.amountCents <= 0) {
        setError('Todos los cobros deben tener un monto mayor a $0.')
        return
      }
      // Fiados no admiten 'other' (mismo criterio que la venta actual, canteen.types.ts).
      if (l.method === 'other') {
        setError('Elegí efectivo, transferencia o MercadoPago.')
        return
      }
      charges.push({ amount: l.amountCents, method: l.method })
    }
    const totalCents = charges.reduce((s, c) => s + c.amount, 0)
    if (totalCents !== tab.totalAmount) {
      setError(
        `Los cobros tienen que sumar exacto ${formatArs(tab.totalAmount)} (ingresaste ${formatArs(totalCents)}).`,
      )
      return
    }
    runCharge(charges)
  }

  /** Atajo "Cobrar todo en efectivo": cobra el total del fiado en un solo toque. */
  function submitQuickAllCash() {
    if (!tab || tab.totalAmount <= 0) return
    setError(null)
    setLines([newChargeLine(tab.totalAmount, 'cash')])
    runCharge([{ amount: tab.totalAmount, method: 'cash' }])
  }

  return (
    <Dialog open={tab !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cobrar fiado — {tab?.debtorName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <SplitPaymentFields
            lines={lines}
            onChange={setLines}
            quickAllCashCents={tab?.totalAmount}
            onQuickAllCash={submitQuickAllCash}
            disabled={isPending}
            methodOptions={CANTEEN_METHOD_OPTIONS}
          />
          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
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
      <DialogContent className="max-w-md">
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
