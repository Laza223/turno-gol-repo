'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SplitPaymentFields, newChargeLine, type ChargeLine } from '@/components/admin/SplitPaymentFields'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { chipClass, METHOD_OPTIONS, type SaleMethod } from '../caja-lib'
import type { StreetMoneyRow } from '@/modules/cashflow/street-money.service'
// Server Actions importadas directamente (mismo patrón que deudas/ChargeDebtDialog.tsx,
// que tampoco tiene story de Storybook — CloseDayButton/TabDialog SÍ la pasan por prop
// porque ellos rompen Storybook al arrastrar drizzle/node:async_hooks al bundle).
import { chargeDebtAction } from '../../deudas/actions'
import { settleTabAction } from '../cantina/actions'
import { registerInscriptionPaymentAction } from '../../torneos/actions'

const ORIGIN_LABEL: Record<StreetMoneyRow['origin'], string> = {
  booking: 'turno',
  canteen_tab: 'fiado',
  tournament: 'inscripción',
}

/**
 * "Cobrar" único para las 3 filas de Plata en la calle (criterio de salida
 * #2). Turnos ya soporta método mixto (chargeDebtAction) — usa
 * SplitPaymentFields con hasta 5 líneas. Cuotas de torneo soportan pago
 * parcial pero todavía un solo método (registerInscriptionPayment) — 1 línea
 * editable. Fiados no soportan monto editable ni split (settleTab siempre
 * cobra el total del ticket): solo elegir método, mismo patrón que
 * cantina/FiadosList.tsx → SettleTabDialog. T3/T4 amplían fiados/torneos a
 * método mixto — esta misma UI (SplitPaymentFields) ya está lista para eso.
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
  const [canteenMethod, setCanteenMethod] = useState<SaleMethod>('cash')
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  const [lastRefId, setLastRefId] = useState<string | null>(null)
  if (row && row.refId !== lastRefId) {
    setLastRefId(row.refId)
    setError(null)
    setCanteenMethod('cash')
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

    if (row.origin === 'canteen_tab') {
      startTransition(async () => {
        try {
          const res = await settleTabAction({
            tabId: row.refId,
            method: canteenMethod,
            clientIdempotencyKey: idempotencyKey,
          })
          if (res.success) {
            toast({ title: `Fiado cobrado — ${row.debtorName}`, variant: 'success' })
            setLastRefId(null)
            onClose()
            router.refresh()
          } else {
            setError(res.error)
          }
        } catch (err) {
          Sentry.captureException(err)
          setError('No pudimos cobrar el fiado. Revisá tu conexión e intentá de nuevo.')
        }
      })
      return
    }

    const parsedCharges: { amount: number; method: ChargeLine['method'] }[] = []
    for (const l of lines) {
      if (l.amountCents == null || l.amountCents <= 0) {
        setError('Todos los cobros deben tener un monto mayor a $0.')
        return
      }
      parsedCharges.push({ amount: l.amountCents, method: l.method })
    }
    if (parsedCharges.length === 0) {
      setError('Ingresá al menos una línea de cobro.')
      return
    }
    const totalCents = parsedCharges.reduce((s, c) => s + c.amount, 0)
    if (totalCents > row.pendingCents) {
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
            : await registerInscriptionPaymentAction({
                teamId: row.refId,
                amount: parsedCharges[0]!.amount,
                method: parsedCharges[0]!.method,
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

          {row.origin === 'canteen_tab' ? (
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-foreground">Método de pago</legend>
              <div className="grid grid-cols-3 gap-2">
                {METHOD_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setCanteenMethod(m.value)}
                    disabled={isPending}
                    aria-pressed={canteenMethod === m.value}
                    className={chipClass(canteenMethod === m.value)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <SplitPaymentFields
              lines={lines}
              onChange={setLines}
              maxLines={row.origin === 'booking' ? 5 : 1}
              quickAllCashCents={row.pendingCents}
              disabled={isPending}
            />
          )}

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
