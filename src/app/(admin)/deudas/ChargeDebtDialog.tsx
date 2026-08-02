'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SplitPaymentFields, newChargeLine, type ChargeLine } from '@/components/admin/SplitPaymentFields'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import type { MethodKey } from '@/lib/payment-method'
import { chargeDebtAction, type ChargeDebtResult } from './actions'
import type { DebtRow } from './queries'

type Method = MethodKey

type Props = {
  debt: DebtRow | null
  onClose: () => void
  onSuccess?: () => void
}

export function ChargeDebtDialog({ debt, onClose, onSuccess }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Track the ID of the debt being edited to avoid state retention across different dialogs
  const [lastDebtId, setLastDebtId] = useState<string | null>(null)
  const [charges, setCharges] = useState<ChargeLine[]>([])

  if (debt && debt.id !== lastDebtId) {
    setLastDebtId(debt.id)
    setError(null)
    const initialAmount = Math.max(0, debt.pending)
    setCharges([newChargeLine(initialAmount > 0 ? initialAmount : null, 'cash')])
  }

  if (!debt) return null

  function handleClose() {
    setError(null)
    setLastDebtId(null)
    onClose()
  }

  const totalChargingCents = charges.reduce((acc, c) => {
    return acc + (c.amountCents != null && c.amountCents > 0 ? c.amountCents : 0)
  }, 0)

  const remainingDebtAfterCharge = Math.max(0, debt.pending - totalChargingCents)

  function submit() {
    setError(null)

    const parsedCharges: { amount: number; method: Method }[] = []
    for (const c of charges) {
      if (c.amountCents == null || c.amountCents <= 0) {
        setError('Todos los cobros deben tener un monto mayor a $0.')
        return
      }
      parsedCharges.push({ amount: c.amountCents, method: c.method })
    }

    if (parsedCharges.length === 0) {
      setError('Debes ingresar al menos una línea de cobro.')
      return
    }

    const totalCents = parsedCharges.reduce((s, c) => s + c.amount, 0)
    if (totalCents > debt!.pending) {
      setError(`El cobro total (${formatArs(totalCents)}) supera la deuda pendiente (${formatArs(debt!.pending)}).`)
      return
    }

    const clientIdempotencyKey = crypto.randomUUID()

    startTransition(async () => {
      const res: ChargeDebtResult = await chargeDebtAction({
        bookingId: debt!.id,
        charges: parsedCharges,
        clientIdempotencyKey,
      })

      if (res.success) {
        toast({
          title: remainingDebtAfterCharge > 0 ? 'Pago registrado parcial' : 'Deuda saldada por completo',
          description: `Se registró el pago por ${formatArs(totalCents)}.`,
          variant: 'success',
        })
        setLastDebtId(null)
        onClose()
        if (onSuccess) onSuccess()
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  const label = `${debt.courtName} · ${debt.date} (${debt.timeStart.slice(0, 5)} - ${debt.timeEnd.slice(0, 5)})`

  return (
    <Dialog open={debt !== null} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-2xl">
        <DialogHeader>
          <DialogTitle>Saldar Deuda</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{label}</p>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
            {/* Columna Izquierda: Breakdown de deuda y nota */}
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Estado de deuda
              </h4>

              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Precio original del turno</dt>
                  <dd className="font-semibold text-foreground">{formatArs(debt.priceSnapshot)}</dd>
                </div>
                {debt.depositCounted > 0 && (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Seña abonada</dt>
                    <dd className="text-foreground">−{formatArs(debt.depositCounted)}</dd>
                  </div>
                )}
                {debt.chargesTotal > 0 && (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Pagos cobrados previamente</dt>
                    <dd className="text-foreground">−{formatArs(debt.chargesTotal)}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border/80 pt-2">
                  <dt className="font-medium text-foreground">Deuda actual pendiente</dt>
                  <dd className="font-bold text-base text-red-600 dark:text-red-400">{formatArs(debt.pending)}</dd>
                </div>
              </dl>

              {debt.notesInternal && (
                <div className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-300 border border-amber-500/20">
                  <span className="font-semibold">Nota previa:</span> {debt.notesInternal}
                </div>
              )}
            </div>

            {/* Columna Derecha: Ingreso de pagos */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Registrar cobro de deuda
              </h4>

              <SplitPaymentFields
                lines={charges}
                onChange={setCharges}
                quickAllCashCents={debt.pending}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Remaining balance preview */}
          <div className="rounded-lg bg-accent/50 p-3 text-xs md:text-sm flex items-center justify-between">
            <span className="text-muted-foreground font-medium">Deuda restante post-pago:</span>
            <span
              className={`font-semibold tabular-nums ${
                remainingDebtAfterCharge > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {remainingDebtAfterCharge > 0
                ? `${formatArs(remainingDebtAfterCharge)} (Queda saldo)`
                : '$0 — ¡Deuda Saldada!'}
            </span>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive font-medium">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="h-10 px-4 rounded-lg border border-input bg-background text-sm font-semibold text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <Button type="button" onClick={submit} isLoading={isPending} className="px-5">
              {isPending ? 'Registrando...' : 'Registrar pago de deuda'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
