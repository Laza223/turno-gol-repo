'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  SplitPaymentFields,
  newChargeLine,
  type ChargeLine,
} from '@/components/admin/SplitPaymentFields'
import { toast } from '@/hooks/use-toast'
import { useUnconfirmedSubmit } from '@/hooks/use-unconfirmed-submit'
import { UnconfirmedRetry } from '@/components/admin/UnconfirmedRetry'
import { formatArs } from '@/lib/format'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/payment-method'
import type { StreetMoneyRow } from '@/modules/cashflow/street-money.service'
// Server Actions importadas directamente (mismo patrón que deudas/ChargeDebtDialog.tsx,
// que tampoco tiene story de Storybook — TabDialog SÍ la pasa por prop porque
// rompe Storybook al arrastrar drizzle/node:async_hooks al bundle).
import { chargeDebtAction } from './actions'
import { settleTabAction } from '../cantina/actions'
import { registerInscriptionPaymentAction } from '../../torneos/actions'

/** Qué se cobra. Un turno es "no cobrado", nunca "deuda" (DESIGN.md). */
const ORIGIN_LABEL: Record<StreetMoneyRow['origin'], string> = {
  booking: 'Turno no cobrado',
  canteen_tab: 'Fiado sin cobrar',
  tournament: 'Inscripción sin cobrar',
}

// Fiados no admiten 'other' (canteen.types.ts: CanteenSaleMethod excluye 'other').
const CANTEEN_METHOD_OPTIONS = PAYMENT_METHOD_OPTIONS.filter((m) => m.value !== 'other')

/** Un cobro que salió: lo que se reenvía si la respuesta no vuelve. */
type ChargeAttempt = {
  row: StreetMoneyRow
  charges: { amount: number; method: ChargeLine['method'] }[]
}

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
  const attempt = useUnconfirmedSubmit<ChargeAttempt>()
  const retry = attempt.retryPayload

  // La key NO se rota al abrir otra fila: un cobro cortado por la red se
  // reintenta al reabrir (ver useUnconfirmedSubmit).
  const [lastRefId, setLastRefId] = useState<string | null>(null)
  if (row && row.refId !== lastRefId) {
    setLastRefId(row.refId)
    setError(null)
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

  /**
   * Corre la mutación real a partir de un array de cargos ya validado —
   * la sacamos de `submit` para que el atajo "Cobrar todo en efectivo" la
   * pueda invocar con un cargo armado en el momento, sin depender de `lines`
   * (que todavía no se actualizó por el `setLines` de ese mismo click).
   */
  function runCharge(parsedCharges: ChargeAttempt['charges']) {
    if (!row) return
    run({ row, charges: parsedCharges })
  }

  function run(payload: ChargeAttempt) {
    const { row: charged, charges } = payload
    const totalCents = charges.reduce((s, c) => s + c.amount, 0)
    setError(null)
    startTransition(async () => {
      const res = await attempt.send(payload, (_, clientIdempotencyKey) =>
        charged.origin === 'booking'
          ? chargeDebtAction({ bookingId: charged.refId, charges, clientIdempotencyKey })
          : charged.origin === 'canteen_tab'
            ? settleTabAction({
                tabId: charged.refId,
                charges: charges as {
                  amount: number
                  method: 'cash' | 'transfer' | 'mercadopago'
                }[],
                clientIdempotencyKey,
              })
            : registerInscriptionPaymentAction({
                teamId: charged.refId,
                charges,
                clientIdempotencyKey,
              }),
      )
      if (!res) return
      if (res.success) {
        toast({
          title: `Cobro registrado — ${charged.debtorName}`,
          description: `${formatArs(totalCents)} · ${totalCents >= charged.pendingCents ? 'saldado' : 'pago parcial'}.`,
          variant: 'success',
        })
        setLastRefId(null)
        onClose()
        router.refresh()
      } else {
        // Después del await, un set* suelto ya no es parte de la transición: se pintaba un
        // render antes de que `pending` bajara, con los controles todavía deshabilitados.
        startTransition(() => setError(res.error))
      }
    })
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
        setError(
          `Los cobros tienen que sumar exacto ${formatArs(row.pendingCents)} (ingresaste ${formatArs(totalCents)}).`,
        )
        return
      }
    } else if (totalCents > row.pendingCents) {
      setError(
        `El cobro total (${formatArs(totalCents)}) supera lo pendiente (${formatArs(row.pendingCents)}).`,
      )
      return
    }

    runCharge(parsedCharges)
  }

  /** Atajo "Cobrar todo en efectivo": cobra el total pendiente en un solo toque. */
  function submitQuickAllCash() {
    if (!row || row.pendingCents <= 0) return
    setError(null)
    setLines([newChargeLine(row.pendingCents, 'cash')])
    runCharge([{ amount: row.pendingCents, method: 'cash' }])
  }

  return (
    <Dialog open={row !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cobrar — {(retry?.row ?? row).debtorName}</DialogTitle>
        </DialogHeader>
        {retry && (
          <UnconfirmedRetry
            what={`el cobro de ${formatArs(retry.charges.reduce((s, c) => s + c.amount, 0))} a ${retry.row.debtorName}`}
            retryLabel="Reintentar cobro"
            isPending={isPending}
            onRetry={() => run(retry)}
          />
        )}
        <div className="space-y-4" hidden={retry !== null}>
          <p className="text-sm text-muted-foreground">
            {ORIGIN_LABEL[row.origin]} · pendiente{' '}
            <span className="font-semibold text-foreground">{formatArs(row.pendingCents)}</span>
          </p>

          <SplitPaymentFields
            lines={lines}
            onChange={setLines}
            quickAllCashCents={row.pendingCents}
            onQuickAllCash={submitQuickAllCash}
            disabled={isPending}
            methodOptions={row.origin === 'canteen_tab' ? CANTEEN_METHOD_OPTIONS : undefined}
            idPrefix="deuda"
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
