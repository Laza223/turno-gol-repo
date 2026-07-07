'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completeBookingAction, markNoShowAction, cancelBookingAction } from '../actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'

type CancellationType = 'complejo' | 'jugador'

type Props = {
  bookingId: string
  status: string
  depositStatus: string
  depositAmount: number
  paymentMethod: string | null
  /** Fecha del turno (YYYY-MM-DD) para evaluar la política de cancelación. */
  bookingDate: string
  /** Hora de inicio (HH:MM:SS). */
  timeStart: string
  /** Horas de anticipación de la política de cancelación del complejo. */
  cancellationPolicyHours: number
}

// ART = UTC-3. Mismo cálculo que el server (artDateAt) para que el preview de
// "dentro/fuera de plazo" coincida con la decisión real de cancelByAdmin.
function bookingStartMs(dateStr: string, hhmmss: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, m] = hhmmss.split(':').map(Number)
  return Date.UTC(y!, (mo ?? 1) - 1, d ?? 1, (h ?? 0) + 3, m ?? 0)
}

export default function BookingActions({
  bookingId,
  status,
  depositStatus,
  depositAmount,
  paymentMethod,
  bookingDate,
  timeStart,
  cancellationPolicyHours,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [noShowOpen, setNoShowOpen] = useState(false)
  const [cancelType, setCancelType] = useState<CancellationType | null>(null)
  const [reason, setReason] = useState('')

  if (status !== 'confirmed') return null

  const hasPaidDeposit = depositStatus === 'paid' && depositAmount > 0
  const inPolicy =
    Date.now() < bookingStartMs(bookingDate, timeStart) - cancellationPolicyHours * 3_600_000

  function runDirect(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) setError(res.error ?? 'No se pudo completar la acción.')
      else router.refresh()
    })
  }

  async function onConfirmCancel(): Promise<{ success: boolean; error?: string }> {
    if (!cancelType) return { success: false, error: 'Indicá quién cancela la reserva.' }
    if (reason.trim().length < 3) return { success: false, error: 'Ingresá un motivo (mínimo 3 caracteres).' }
    const res = await cancelBookingAction(bookingId, reason.trim(), cancelType)
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

  // Paso 2: qué pasa con la seña según el motivo elegido. El complejo reembolsa
  // siempre; el jugador, según la política horaria del complejo.
  const willRefund = cancelType === 'complejo' ? true : cancelType === 'jugador' ? inPolicy : false

  let refundPreview: string | null = null
  if (cancelType) {
    if (!hasPaidDeposit) {
      refundPreview = 'Esta reserva no tiene seña pagada. Solo se libera el turno.'
    } else if (willRefund) {
      refundPreview =
        paymentMethod === 'mercadopago'
          ? `Se reembolsará la seña de ${formatArs(depositAmount)} vía MercadoPago.`
          : `Coordiná el reembolso de ${formatArs(depositAmount)} en efectivo/transferencia con el jugador (no es automático).`
    } else {
      refundPreview = `Fuera del plazo de cancelación (${cancellationPolicyHours}h): la seña de ${formatArs(depositAmount)} queda para el complejo (sin reembolso).`
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => runDirect(() => completeBookingAction(bookingId))}
          className="h-11 md:h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          Marcar completada
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setNoShowOpen(true)}
          className="h-11 md:h-9 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          Marcar ausente
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => { setReason(''); setCancelType(null); setCancelOpen(true) }}
          className="h-11 md:h-9 rounded-lg border border-red-200 dark:border-red-500/30 bg-card px-4 text-sm font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar reserva"
        description="Primero indicá por qué se cancela. Eso define si corresponde reembolsar la seña."
        variant="destructive"
        confirmLabel="Cancelar reserva"
        cancelLabel="Volver"
        onConfirm={onConfirmCancel}
      >
        <div className="space-y-3">
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-foreground">¿Quién cancela?</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="cancel-type"
                className="mt-0.5"
                checked={cancelType === 'complejo'}
                onChange={() => setCancelType('complejo')}
              />
              <span>
                <span className="font-medium">El complejo necesita cancelar</span>
                <span className="block text-xs text-muted-foreground">Rotura, mantenimiento o error. Reembolso automático de la seña.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="cancel-type"
                className="mt-0.5"
                checked={cancelType === 'jugador'}
                onChange={() => setCancelType('jugador')}
              />
              <span>
                <span className="font-medium">El jugador pidió cancelar</span>
                <span className="block text-xs text-muted-foreground">Se aplica la política de cancelación del complejo.</span>
              </span>
            </label>
          </fieldset>

          {refundPreview && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-500/30">
              {refundPreview}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="cancel-reason" className="text-xs font-medium text-foreground">Motivo (obligatorio)</label>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={noShowOpen}
        onOpenChange={setNoShowOpen}
        title="Marcar como ausente"
        description="Se registrará que el jugador no se presentó. Si el complejo tiene penalidad activa, puede generar deuda o suspensión del jugador. Esta acción no se puede deshacer pasadas 24hs."
        variant="destructive"
        confirmLabel="Marcar ausente"
        cancelLabel="Volver"
        onConfirm={onConfirmNoShow}
      />
    </div>
  )
}
