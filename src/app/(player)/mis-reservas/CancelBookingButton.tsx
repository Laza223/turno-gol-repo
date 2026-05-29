'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cancelMyBookingAction } from './actions'

type Props = {
  bookingId: string
  courtName: string
  dateLabel: string
  timeLabel: string
}

export function CancelBookingButton({ bookingId, courtName, dateLabel, timeLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const router = useRouter()

  async function handleConfirm() {
    const result = await cancelMyBookingAction(bookingId, reason.trim() || undefined)
    if (!result.success) {
      return { success: false as const, error: result.error }
    }
    router.refresh()
    return { success: true as const }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors duration-150 h-11 px-3 rounded-md hover:bg-red-50 active:scale-[0.98]"
      >
        Cancelar
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="¿Cancelar esta reserva?"
        description={
          <>
            Reserva en <strong>{courtName}</strong> el <strong>{dateLabel}</strong> a las{' '}
            <strong>{timeLabel}</strong>.
            <br />
            <br />
            Si estás <strong>en el plazo</strong> de cancelación que fijó el complejo, tu seña se
            reembolsa. <strong>Fuera del plazo</strong>, la seña queda como cargo del complejo.
          </>
        }
        confirmLabel="Sí, cancelar"
        cancelLabel="Volver"
        variant="destructive"
        onConfirm={handleConfirm}
      >
        <div className="space-y-1">
          <label htmlFor="cancel-reason" className="text-xs font-medium text-slate-700">
            Motivo (opcional)
          </label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Ej: no puedo ir, lluvia, equivocación de horario..."
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 resize-none"
          />
        </div>
      </ConfirmDialog>
    </>
  )
}
