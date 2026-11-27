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
import { formatYearMonthEs, listUpcomingYearMonths } from '@/lib/month-bounds'
import type {
  AbonadoBillingMode,
  SettleAbonadoPeriodInput,
  SettlementActionResult,
} from '@/modules/settlements/settlement.types'
import { cn } from '@/lib/utils'

export type AbonadoSettlementTarget = {
  abonadoId: string
  contactName: string
  pricePerSession: number
  billingMode: AbonadoBillingMode
  agreedAmount: number
  coveredMonths?: string[]
  remainingPackSessions?: number
}

type Props = {
  target: AbonadoSettlementTarget
  defaultYearMonth: string
  settleAction: (input: SettleAbonadoPeriodInput) => Promise<SettlementActionResult>
  onClose: () => void
  onSuccess: () => void
}

type ScopeKind = 'pack' | 'monthly'
type PaymentMode = 'caja' | 'already_settled'

function pickInitialMonth(baseYm: string, coveredMonths: readonly string[] = []): string {
  const options = listUpcomingYearMonths(baseYm, 6)
  const firstOpen = options.find((o) => !coveredMonths.includes(o.value))
  return firstOpen?.value ?? options[0]!.value
}

function defaultAmountFor(
  scope: ScopeKind,
  credits: number,
  target: AbonadoSettlementTarget,
): number | null {
  if (scope === 'monthly') {
    if (target.agreedAmount > 0) return target.agreedAmount
    return target.pricePerSession > 0 ? target.pricePerSession * 4 : null
  }
  if (target.billingMode === 'pack' && target.agreedAmount > 0 && credits === 4) {
    return target.agreedAmount
  }
  return target.pricePerSession > 0 ? target.pricePerSession * credits : null
}

/**
 * Diálogo único para cobrar o marcar como saldado un mes completo o un pack de N turnos
 * de un turno fijo existente. Funciona igual desde `/abonados` y desde Grilla/Hoy.
 */
export function AbonadoSettlementDialog({
  target,
  defaultYearMonth,
  settleAction,
  onClose,
  onSuccess,
}: Props) {
  const { toast } = useToast()
  const initialScope: ScopeKind = target.billingMode === 'monthly' ? 'monthly' : 'pack'
  const [scope, setScope] = useState<ScopeKind>(initialScope)
  const [credits, setCredits] = useState(4)
  const [month, setMonth] = useState(() => pickInitialMonth(defaultYearMonth, target.coveredMonths))
  const [paymentOrigin, setPaymentOrigin] = useState<PaymentMode>('caja')
  const [amountCents, setAmountCents] = useState<number | null>(() =>
    defaultAmountFor(initialScope, 4, target),
  )
  const [lines, setLines] = useState<ChargeLine[]>(() => [
    newChargeLine(defaultAmountFor(initialScope, 4, target), 'cash'),
  ])
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const monthOptions = listUpcomingYearMonths(defaultYearMonth, 6)
  const coveredSet = new Set(target.coveredMonths ?? [])
  const linesTotal = lines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0)

  function handleScopeChange(next: ScopeKind) {
    setScope(next)
    setError(null)
    const nextAmount = defaultAmountFor(next, credits, target)
    setAmountCents(nextAmount)
    if (paymentOrigin === 'caja') {
      setLines([newChargeLine(nextAmount, lines[0]?.method ?? 'cash')])
    }
  }

  function handleCreditsChange(nextCredits: number) {
    const safe = Math.max(1, Math.min(52, Math.trunc(nextCredits) || 1))
    setCredits(safe)
    const nextAmount = defaultAmountFor('pack', safe, target)
    setAmountCents(nextAmount)
    if (paymentOrigin === 'caja' && lines.length <= 1) {
      setLines([newChargeLine(nextAmount, lines[0]?.method ?? 'cash')])
    }
  }

  function handlePaymentOriginChange(next: PaymentMode) {
    setPaymentOrigin(next)
    setError(null)
    if (next === 'caja') {
      setLines([newChargeLine(amountCents, lines[0]?.method ?? 'cash')])
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
      const hasInvalidLine = lines.some((l) => !l.amountCents || l.amountCents <= 0)
      if (lines.length === 0 || hasInvalidLine || finalAmount <= 0) {
        setError('Ingresá un monto mayor a $ 0 y su método de pago.')
        return
      }
    }

    setError(null)
    startTransition(async () => {
      const res = await settleAction({
        abonadoId: target.abonadoId,
        kind: scope,
        paymentOrigin,
        amount: finalAmount,
        ...(scope === 'pack' ? { creditsTotal: credits } : { month }),
        ...(paymentOrigin === 'caja'
          ? {
              charges: lines.map((l) => ({
                amount: l.amountCents!,
                method: l.method,
              })),
              clientIdempotencyKey: idempotencyKey,
            }
          : {}),
      })
      if (!res.success) {
        startTransition(() => setError(res.error))
        return
      }
      const covered = res.coveredBookingIds.length
      toast({
        title:
          scope === 'monthly'
            ? `Mes ${formatYearMonthEs(month)} saldado`
            : `Pack de ${credits} turnos saldado`,
        description:
          covered > 0
            ? `${covered} turno${covered === 1 ? '' : 's'} marcado${covered === 1 ? '' : 's'} como saldado${covered === 1 ? '' : 's'}.`
            : 'Las próximas fechas se cubren automáticamente al generarse.',
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
            Saldar o cobrar · {target.contactName}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {target.coveredMonths?.length || target.remainingPackSessions ? (
            <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
              {target.coveredMonths && target.coveredMonths.length > 0 && (
                <p>
                  Meses ya saldados:{' '}
                  <strong className="text-foreground">
                    {target.coveredMonths.map(formatYearMonthEs).join(', ')}
                  </strong>
                </p>
              )}
              {target.remainingPackSessions != null && target.remainingPackSessions > 0 && (
                <p>
                  Pack vigente:{' '}
                  <strong className="text-foreground">
                    quedan {target.remainingPackSessions} turno
                    {target.remainingPackSessions === 1 ? '' : 's'} por jugar
                  </strong>
                </p>
              )}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>¿Qué querés cubrir?</Label>
            <SegmentedControl<ScopeKind>
              className="grid grid-cols-2 gap-1.5"
              aria-label="Tipo de cobertura"
              value={scope}
              onValueChange={handleScopeChange}
              itemClassName={choiceChipClass}
              options={[
                { value: 'pack', label: 'Pack de turnos' },
                { value: 'monthly', label: 'Todo el mes' },
              ]}
            />
          </div>

          {scope === 'pack' ? (
            <div className="space-y-2">
              <Label htmlFor="settle-pack-count">Cantidad de turnos</Label>
              <div className="flex items-center gap-1.5">
                {[4, 8].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleCreditsChange(n)}
                    className={choiceChipClass(credits === n)}
                  >
                    {n} turnos
                  </button>
                ))}
                <input
                  id="settle-pack-count"
                  type="number"
                  min={1}
                  max={52}
                  value={credits}
                  onChange={(e) => handleCreditsChange(Number(e.target.value))}
                  className="h-11 w-20 rounded-md border border-input bg-card px-2.5 text-center text-sm tabular-nums md:h-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Si cancelan un turno con aviso, el crédito pasa al siguiente. Si no vienen, se
                consume.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="settle-month">Mes calendario</Label>
              <select
                id="settle-month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm md:h-10"
              >
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value} disabled={coveredSet.has(m.value)}>
                    {m.label}
                    {coveredSet.has(m.value) ? ' (ya saldado)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Cubre todas las fechas del mes elegido, tenga 4 o 5 semanas.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>¿Cómo lo registrás en Caja?</Label>
            <SegmentedControl<PaymentMode>
              className="grid grid-cols-2 gap-1.5"
              aria-label="Registro en Caja"
              value={paymentOrigin}
              onValueChange={handlePaymentOriginChange}
              itemClassName={choiceChipClass}
              options={[
                { value: 'caja', label: 'Cobrar ahora en Caja' },
                { value: 'already_settled', label: 'Ya estaba saldado' },
              ]}
            />
          </div>

          {paymentOrigin === 'caja' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Monto y método</Label>
                {linesTotal > 0 && (
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    Total {formatArs(linesTotal)}
                  </span>
                )}
              </div>
              <SplitPaymentFields
                idPrefix="abonado-settle"
                lines={lines}
                onChange={handleLinesChange}
                maxLines={5}
              />
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
              <Label htmlFor="settled-ref-amount">
                Monto acordado <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <MoneyInput
                id="settled-ref-amount"
                valueCents={amountCents}
                onValueChange={setAmountCents}
                minCents={0}
                placeholder="0"
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                Marca los turnos como saldados sin sumar plata nueva en Caja hoy.
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
            <Button type="submit" disabled={isPending} className={cn('gap-1.5')}>
              <Check className="h-4 w-4" aria-hidden />
              {isPending
                ? 'Guardando…'
                : paymentOrigin === 'caja'
                  ? `Registrar ${linesTotal > 0 ? formatArs(linesTotal) : 'cobro'}`
                  : 'Marcar como saldado'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
