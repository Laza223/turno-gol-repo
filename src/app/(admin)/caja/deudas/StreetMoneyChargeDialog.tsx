'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SplitPaymentFields, newChargeLine, type ChargeLine } from '@/components/admin/SplitPaymentFields'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/payment-method'
import type { StreetMoneyRow } from '@/modules/cashflow/street-money.service'
// Server Actions importadas directamente (mismo patrón que deudas/ChargeDebtDialog.tsx,
// que tampoco tiene story de Storybook — CloseDayButton/TabDialog SÍ la pasan por prop
// porque ellos rompen Storybook al arrastrar drizzle/node:async_hooks al bundle).
import { chargeDebtAction } from './actions'
import { settleTabAction } from '../cantina/actions'
import { registerInscriptionPaymentAction } from '../../torneos/actions'

const ORIGIN_LABEL: Record<StreetMoneyRow['origin'], string> = {
  booking: 'turno',
  canteen_tab: 'fiado',
  tournament: 'inscripción',
}

// Fiados no admiten 'other' (canteen.types.ts: CanteenSaleMethod excluye 'other').
const CANTEEN_METHOD_OPTIONS = PAYMENT_METHOD_OPTIONS.filter((m) => m.value !== 'other')

/**
 * "Cobrar" único para las 3 filas de Plata en la calle (criterio de salida
 * #2), con método mixto en las 3 (criterio #3, D2) vía SplitPaymentFields:
 * - booking: hasta 5 líneas, pago parcial permitido (chargeDebtAction).
 * - tournament: hasta 5 líneas, pago parcial permitido (registerInscriptionPayment).
 * - canteen_tab: hasta 5 líneas, pero TIENEN que sumar EXACTO lo pendiente
 *   (settleTab no admite parcial — el ticket ya se entregó completo).
 */
export function StreetMoneyChargeDialog({
  row,
  onClose,
}: {
  row: StreetMoneyRow | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<ChargeLine[]>([])
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  const [lastRefId, setLastRefId] = useState<string | null>(null)
  if (row && row.refId !== lastRefId) {
    setLastRefId(row.refId)
    setError(null)
    setIdempotencyKey(crypto.randomUUID())
    setLines([newChargeLine(row.pendingCents, 'cash')])
  }

  if (!row) return null

  function handleOpenChange(next: boolean) {
    if (isPending) return
    if (!next) {
      setLastRefId(null)
      onClose()
    }
  }

  function submit() {
    if (!row) return
    setError(null)

    const parsedCharges: { amount: number; method: ChargeLine['method'] }[] = []
    for (const l of lines) {
      if (l.amountCents == null || l.amountCents <= 0) {
        setError('Todos los cobros deben tener un monto mayor a $0.')
        return
      }
      if (row.origin === 'canteen_tab' && l.method === 'other') {
        setError('Elegí efectivo, transferencia o MercadoPago.')
        return
      }
      parsedCharges.push({ amount: l.amountCents, method: l.method })
    }
    if (parsedCharges.length === 0) {
      setError('Ingresá al menos una línea de cobro.')
      return
    }
    const totalCents = parsedCharges.reduce((s, c) => s + c.amount, 0)

    if (row.origin === 'canteen_tab') {
      if (totalCents !== row.pendingCents) {
        setError(`Los cobros tienen que sumar exacto ${formatArs(row.pendingCents)} (ingresaste ${formatArs(totalCents)}).`)
        return
      }
    } else if (totalCents > row.pendingCents) {
      setError(`El cobro total (${formatArs(totalCents)}) supera lo pendiente (${formatArs(row.pendingCents)}).`)
      return
    }

    startTransition(async () => {
      try {
        const res =
          row.origin === 'booking'
            ? await chargeDebtAction({
                bookingId: row.refId,
                charges: parsedCharges,
                clientIdempotencyKey: idempotencyKey,
              })
            : row.origin === 'canteen_tab'
              ? await settleTabAction({
                  tabId: row.refId,
                  charges: parsedCharges as { amount: number; method: 'cash' | 'transfer' | 'mercadopago' }[],
                  clientIdempotencyKey: idempotencyKey,
                })
              : await registerInscriptionPaymentAction({
                  teamId: row.refId,
                  charges: parsedCharges,
                  clientIdempotencyKey: idempotencyKey,
                })
        if (res.success) {
          toast({
            title: `Cobro registrado — ${row.debtorName}`,
            description: `${formatArs(totalCents)} · ${totalCents >= row.pendingCents ? 'saldado' : 'pago parcial'}.`,
            variant: 'success',
          })
          setLastRefId(null)
          onClose()
          router.refresh()
        } else {
          setError(res.error)
        }
      } catch (err) {
        Sentry.captureException(err)
        setError('No pudimos registrar el cobro. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  return (
    <Dialog open={row !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cobrar — {row.debtorName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Deuda de {ORIGIN_LABEL[row.origin]} · pendiente{' '}
            <span className="font-semibold text-foreground">{formatArs(row.pendingCents)}</span>
          </p>

          <SplitPaymentFields
            lines={lines}
            onChange={setLines}
            quickAllCashCents={row.pendingCents}
            disabled={isPending}
            methodOptions={row.origin === 'canteen_tab' ? CANTEEN_METHOD_OPTIONS : undefined}
          />

          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
              className="h-10 px-4 rounded-lg border border-input bg-background text-sm font-semibold text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="h-10 px-5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {isPending ? 'Registrando…' : 'Cobrar'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
