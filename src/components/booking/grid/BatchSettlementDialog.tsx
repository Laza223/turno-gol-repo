'use client'

import { useState, useTransition } from 'react'
import { Check, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { choiceChipClass, SegmentedControl } from '@/components/ui/segmented-control'
import {
  SplitPaymentFields,
  newChargeLine,
  type ChargeLine,
} from '@/components/admin/SplitPaymentFields'
import { useToast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtRow } from '@/modules/courts/court.types'
import type {
  SettleBookingsBatchInput,
  SettlementActionResult,
} from '@/modules/settlements/settlement.types'

type Props = {
  bookings: GridBooking[]
  courts: CourtRow[]
  settleAction: (input: SettleBookingsBatchInput) => Promise<SettlementActionResult>
  onClose: () => void
  onSuccess: () => void
}

type PaymentMode = 'caja' | 'already_settled'

function bookingLabel(b: GridBooking): string {
  if (b.guestName) return b.guestName
  if (b.playerFirstName) return `${b.playerFirstName} ${b.playerLastName ?? ''}`.trim()
  return 'Sin nombre'
}

/**
 * Permite cobrar juntos en Caja o marcar como ya saldados varios turnos visibles
 * en la grilla (por ejemplo bloques de un torneo o clases de una escuelita).
 */
export function BatchSettlementDialog({
  bookings,
  courts,
  settleAction,
  onClose,
  onSuccess,
}: Props) {
  const { toast } = useToast()
  const courtMap = new Map(courts.map((c) => [c.id, c.name]))
  const initialTotal = bookings.reduce((sum, b) => sum + (b.pending ?? b.priceSnapshot ?? 0), 0)

  const [paymentOrigin, setPaymentOrigin] = useState<PaymentMode>(
    initialTotal > 0 ? 'caja' : 'already_settled',
  )
  const [amountCents, setAmountCents] = useState<number | null>(
    initialTotal > 0 ? initialTotal : null,
  )
  const [lines, setLines] = useState<ChargeLine[]>(() => [
    newChargeLine(initialTotal > 0 ? initialTotal : null, 'cash'),
  ])
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const linesTotal = lines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0)

  function handlePaymentOrigin(next: PaymentMode) {
    setPaymentOrigin(next)
    setError(null)
    if (next === 'caja') {
      const target = amountCents ?? (initialTotal > 0 ? initialTotal : null)
      setLines([newChargeLine(target, lines[0]?.method ?? 'cash')])
    }
  }

  function handleLinesChange(next: ChargeLine[]) {
    setError(null)
    setLines(next)
    const total = next.reduce((sum, l) => sum + (l.amountCents ?? 0), 0)
    if (total > 0) setAmountCents(total)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending) return

    const finalAmount = paymentOrigin === 'caja' ? linesTotal : (amountCents ?? 0)
    if (paymentOrigin === 'caja') {
      const invalid = lines.some((l) => !l.amountCents || l.amountCents <= 0)
      if (lines.length === 0 || invalid || finalAmount <= 0) {
        setError('Ingresá un monto mayor a $ 0 y elegí el método de pago.')
        return
      }
    }

    setError(null)
    startTransition(async () => {
      const res = await settleAction({
        bookingIds: bookings.map((b) => b.id),
        paymentOrigin,
        amount: finalAmount,
        ...(paymentOrigin === 'caja'
          ? {
              charges: lines.map((l) => ({ amount: l.amountCents!, method: l.method })),
              clientIdempotencyKey: idempotencyKey,
            }
          : {}),
      })
      if (!res.success) {
        startTransition(() => setError(res.error))
        return
      }
      toast({
        title: `${bookings.length} turnos saldados`,
        description:
          paymentOrigin === 'caja'
            ? `Cobro registrado en Caja por ${formatArs(finalAmount)}.`
            : 'Quedaron marcados como saldados sin movimiento nuevo en Caja.',
        variant: 'success',
      })
      onSuccess()
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            Saldar {bookings.length} turnos juntos
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border text-xs">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate font-medium text-foreground">
                  {courtMap.get(b.courtId) ?? 'Cancha'} · {b.timeStart} · {bookingLabel(b)}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatArs(b.pending ?? b.priceSnapshot)}
                </span>
              </li>
            ))}
          </ul>

          <div className="space-y-1.5">
            <Label>¿Cómo los registrás?</Label>
            <SegmentedControl<PaymentMode>
              className="grid grid-cols-2 gap-1.5"
              aria-label="Modo de saldado"
              value={paymentOrigin}
              onValueChange={handlePaymentOrigin}
              itemClassName={choiceChipClass}
              options={[
                { value: 'caja', label: 'Cobrar juntos en Caja' },
                { value: 'already_settled', label: 'Ya estaban saldados' },
              ]}
            />
          </div>

          {paymentOrigin === 'caja' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Total acordado y método</Label>
                {linesTotal > 0 && (
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    Total {formatArs(linesTotal)}
                  </span>
                )}
              </div>
              <SplitPaymentFields
                idPrefix="batch-settle"
                lines={lines}
                onChange={handleLinesChange}
                maxLines={5}
              />
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
              <Label htmlFor="batch-settled-ref">
                Monto acordado <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <MoneyInput
                id="batch-settled-ref"
                valueCents={amountCents}
                onValueChange={setAmountCents}
                minCents={0}
                placeholder="0"
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                Marca todos los turnos elegidos como saldados sin crear movimientos en Caja hoy.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className="gap-1.5">
              <Check className="h-4 w-4" aria-hidden />
              {isPending
                ? 'Guardando…'
                : paymentOrigin === 'caja'
                  ? `Cobrar ${linesTotal > 0 ? formatArs(linesTotal) : ''}`
                  : 'Marcar saldados'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
