'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import type { StreetMoneyRow } from '@/modules/cashflow/street-money.service'
// Import directo de cancelTabAction, mismo patrón que StreetMoneyChargeDialog
// (settleTabAction/registerInscriptionPaymentAction): sin story propia acá,
// así que no hace falta pasarla por prop para no romper Storybook.
import { cancelTabAction } from '../cantina/actions'

/**
 * "Anular" para la fila 'Fiado' de /caja/deudas (H117): antes solo existía en
 * /caja/cantina — mismo registro, la reversión disponible dependía de por
 * dónde entrabas. Reusa cancelTabAction tal cual (devuelve el stock, nunca
 * tocó la caja); UI calcada de CancelTabDialog de FiadosList.tsx.
 */
export function StreetMoneyCancelTabDialog({
  row,
  onClose,
}: {
  /** Solo se abre para `row.origin === 'canteen_tab'` — el caller lo garantiza. */
  row: StreetMoneyRow | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const [lastRefId, setLastRefId] = useState<string | null>(null)
  if (row && row.refId !== lastRefId) {
    setLastRefId(row.refId)
    setReason('')
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return
    if (!next) {
      setLastRefId(null)
      onClose()
    }
  }

  function submit() {
    if (!row) return
    const trimmed = reason.trim()
    if (trimmed === '') {
      setError('Contá por qué se anula el fiado.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const res = await cancelTabAction({ tabId: row.refId, reason: trimmed })
        if (res.success) {
          toast({ title: 'Fiado anulado', variant: 'success' })
          setLastRefId(null)
          onClose()
          router.refresh()
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
    <Dialog open={row !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anular fiado — {row?.debtorName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Devuelve el stock entregado. La plata nunca entró a la caja.
          </p>
          <div className="space-y-1">
            <Label htmlFor="street-money-cancel-reason">Motivo</Label>
            <textarea
              id="street-money-cancel-reason"
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
