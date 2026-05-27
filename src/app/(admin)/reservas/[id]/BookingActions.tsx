'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completeBookingAction, markNoShowAction, cancelBookingAction } from '../actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'

type Props = {
  bookingId: string
  status: string
  depositStatus: string
  depositAmount: number
  paymentMethod: string | null
}

function formatARS(centavos: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(centavos / 100)
}

export default function BookingActions({ bookingId, status, depositStatus, depositAmount, paymentMethod }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [noShowOpen, setNoShowOpen] = useState(false)
  const [shouldRefund, setShouldRefund] = useState(false)
  const [reason, setReason] = useState('')

  if (status !== 'confirmed') return null

  const hasPaidDeposit = depositStatus === 'paid' && depositAmount > 0

  function runDirect(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) setError(res.error ?? 'No se pudo completar la acción.')
      else router.refresh()
    })
  }

  async function onConfirmCancel(): Promise<{ success: boolean; error?: string }> {
    if (reason.trim().length < 3) return { success: false, error: 'Ingresá un motivo (mínimo 3 caracteres).' }
    const res = await cancelBookingAction(bookingId, reason.trim(), hasPaidDeposit ? shouldRefund : false)
    if (res.success) {
      toast({ title: 'Reserva cancelada', variant: 'success' })
      router.refresh()
    }
    return res
  }

  async function onConfirmNoShow(): Promise<{ success: boolean; error?: string }> {
    const res = await markNoShowAction(bookingId)
    if (res.success) {
      toast({ title: 'Marcada como ausente', variant: 'success' })
      router.refresh()
    }
    return res
  }

  const refundWarning = !hasPaidDeposit
    ? 'Esta reserva no tiene seña pagada. Solo se libera el turno.'
    : shouldRefund
      ? paymentMethod === 'mercadopago'
        ? `Se reembolsará la seña de ${formatARS(depositAmount)} vía MercadoPago.`
        : `Coordiná el reembolso de ${formatARS(depositAmount)} en efectivo/transferencia con el jugador (no es automático).`
      : `La seña de ${formatARS(depositAmount)} queda para el complejo (sin reembolso).`

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => runDirect(() => completeBookingAction(bookingId))}
          className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
        >
          Marcar completada
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setNoShowOpen(true)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          Marcar ausente
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => { setReason(''); setShouldRefund(false); setCancelOpen(true) }}
          className="h-9 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar reserva"
        description="Esta acción cancela el turno y libera el horario. Ingresá el motivo."
        variant="destructive"
        confirmLabel="Cancelar reserva"
        cancelLabel="Volver"
        onConfirm={onConfirmCancel}
      >
        <div className="space-y-3">
          {hasPaidDeposit && (
            <fieldset className="space-y-1">
              <legend className="text-xs font-medium text-slate-700">¿Reembolsar la seña?</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="refund" checked={!shouldRefund} onChange={() => setShouldRefund(false)} />
                Sin reembolso (la seña queda para el complejo)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="refund" checked={shouldRefund} onChange={() => setShouldRefund(true)} />
                Con reembolso
              </label>
            </fieldset>
          )}
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-600/20">
            {refundWarning}
          </div>
          <div className="space-y-1">
            <label htmlFor="cancel-reason" className="text-xs font-medium text-slate-700">Motivo (obligatorio)</label>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={noShowOpen}
        onOpenChange={setNoShowOpen}
        title="Marcar como ausente"
        description="Se registrará un no-show. Si el complejo tiene penalidad activa, puede generar deuda o ban del jugador. Esta acción no se puede deshacer pasadas 24hs."
        variant="destructive"
        confirmLabel="Marcar ausente"
        cancelLabel="Volver"
        onConfirm={onConfirmNoShow}
      />
    </div>
  )
}
