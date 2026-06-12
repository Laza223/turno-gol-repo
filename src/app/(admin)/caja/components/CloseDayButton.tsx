'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { closeDayAction } from '../actions'
import { toast } from '@/hooks/use-toast'

function formatARS(c: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(c / 100)
}

export function CloseDayButton({
  date,
  totalIncome,
  totalExpense,
  balance,
}: {
  date: string
  totalIncome: number
  totalExpense: number
  balance: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [declaredPesos, setDeclaredPesos] = useState('')
  const [note, setNote] = useState('')

  const declaredCents = declaredPesos.trim() === '' ? undefined : Math.round(Number(declaredPesos) * 100)
  const diff = declaredCents === undefined || !Number.isFinite(declaredCents) ? null : declaredCents - balance
  const noteRequired = diff !== null && diff !== 0

  async function onConfirm(): Promise<{ success: boolean; error?: string }> {
    if (declaredPesos.trim() !== '' && (declaredCents === undefined || !Number.isFinite(declaredCents))) {
      return { success: false, error: 'Efectivo declarado inválido.' }
    }
    if (noteRequired && note.trim().length < 1) {
      return { success: false, error: 'Hay diferencia: la nota es obligatoria.' }
    }
    try {
      const res = await closeDayAction(date, declaredCents, note.trim() || undefined)
      if (res.success) {
        toast({ title: 'Caja cerrada', description: date, variant: 'success' })
        router.refresh()
      }
      return res
    } catch (err) {
      // Error inesperado (DB/red) en el cierre: lo contenemos acá para mostrar un
      // mensaje contextual y permitir reintentar, sin disparar el error boundary
      // ni quedar colgado en "Procesando…" (#49). Mismo patrón que RegisterMovementModal.
      Sentry.captureException(err)
      return { success: false, error: 'No pudimos cerrar la caja. Revisá tu conexión e intentá de nuevo.' }
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setDeclaredPesos(''); setNote(''); setOpen(true) }}
        className="h-11 md:h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors">
        Cerrar caja
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Cerrar caja del ${date}`}
        description="El cierre es inmutable: una vez cerrada no se puede editar ni agregar movimientos a este día. Las correcciones posteriores van como ajustes."
        variant="destructive"
        confirmLabel="Cerrar caja"
        cancelLabel="Volver"
        confirmationPhrase="CERRAR"
        onConfirm={onConfirm}
      >
        <div className="space-y-3">
          <div className="space-y-1 rounded-md bg-slate-50 px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Ingresos</span>
              <span className="font-medium tabular-nums text-emerald-700">{formatARS(totalIncome)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Egresos</span>
              <span className="font-medium tabular-nums text-red-700">−{formatARS(totalExpense)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1">
              <span className="text-slate-600">Saldo neto del día</span>
              <span className="font-semibold tabular-nums text-slate-900">{formatARS(balance)}</span>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="declared" className="text-xs font-medium text-slate-700">Efectivo contado (opcional, pesos)</label>
            <input id="declared" type="number" min="0" step="0.01" value={declaredPesos}
              onChange={(e) => setDeclaredPesos(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm tabular-nums" />
          </div>
          {diff !== null && diff !== 0 && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-600/20">
              Diferencia de {formatARS(diff)}. La nota es obligatoria.
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="close-note" className="text-xs font-medium text-slate-700">
              Nota {noteRequired ? '(obligatoria)' : '(opcional)'}
            </label>
            <textarea id="close-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
          </div>
        </div>
      </ConfirmDialog>
    </>
  )
}
