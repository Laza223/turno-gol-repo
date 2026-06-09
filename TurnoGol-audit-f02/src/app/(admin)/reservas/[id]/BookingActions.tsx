'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completeBookingAction, markNoShowAction, cancelBookingAction } from '../actions'

export default function BookingActions({ bookingId, status }: { bookingId: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (status !== 'confirmed') return null

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) setError(res.error ?? 'No se pudo completar la acción.')
      else router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => completeBookingAction(bookingId))}
          className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
        >
          Marcar completada
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => markNoShowAction(bookingId))}
          className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          Marcar ausente
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => cancelBookingAction(bookingId, 'Cancelada por el complejo', false))}
          className="h-9 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors"
        >
          Cancelar
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
