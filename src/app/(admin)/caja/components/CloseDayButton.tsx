'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { Lock } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatArsContable } from '@/lib/format'
import { mediumDateLabel } from '../caja-lib'
import { closeDayAction } from '../actions'
import { toast } from '@/hooks/use-toast'

export function CloseDayButton({
  date,
  totalIncome,
  totalExpense,
  balance,
  cashTotal,
}: {
  date: string
  totalIncome: number
  totalExpense: number
  balance: number
  /** Neto en efectivo del día (byMethod.cash): la referencia para contar el cajón. */
  cashTotal: number
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
        toast({ title: 'Caja cerrada', description: 'El resumen del día quedó guardado.', variant: 'success' })
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
      <button
        type="button"
        onClick={() => { setDeclaredPesos(''); setNote(''); setOpen(true) }}
        className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-10"
      >
        <Lock className="h-4 w-4" aria-hidden="true" />
        Cerrar caja
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Cerrar caja del ${mediumDateLabel(date)}`}
        description="El cierre es inmutable: una vez cerrada no se puede editar ni agregar movimientos a este día. Las correcciones posteriores van como ajustes."
        confirmLabel="Cerrar caja"
        cancelLabel="Volver"
        confirmationPhrase="CERRAR"
        onConfirm={onConfirm}
      >
        <div className="space-y-3">
          <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ingresos</span>
              <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">+{formatArsContable(totalIncome)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Egresos</span>
              <span className="font-medium tabular-nums text-red-700 dark:text-red-400">−{formatArsContable(totalExpense)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1">
              <span className="text-muted-foreground">Saldo neto del día</span>
              <span className="font-semibold tabular-nums text-foreground">{formatArsContable(balance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">En efectivo según los movimientos</span>
              <span className="font-medium tabular-nums text-foreground">
                {cashTotal < 0 ? `−${formatArsContable(-cashTotal)}` : formatArsContable(cashTotal)}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="declared" className="text-xs font-medium text-foreground">Efectivo contado (opcional, pesos)</label>
            <input id="declared" type="number" min="0" step="0.01" value={declaredPesos}
              onChange={(e) => setDeclaredPesos(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              className="h-11 md:h-10 w-full rounded-md border border-border px-3 text-sm tabular-nums" />
          </div>
          {diff !== null && diff !== 0 && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-500/30">
              Diferencia de {formatArsContable(Math.abs(diff))}{diff < 0 ? ' de menos' : ' de más'}. La nota es obligatoria.
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="close-note" className="text-xs font-medium text-foreground">
              Nota {noteRequired ? '(obligatoria)' : '(opcional)'}
            </label>
            <textarea id="close-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full rounded-md border border-border px-3 py-2 text-sm" />
          </div>
        </div>
      </ConfirmDialog>
    </>
  )
}
