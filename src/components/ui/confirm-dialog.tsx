'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  /** Campos extra (motivo, radios de reembolso, etc.) entre la descripción y el footer. El padre controla su estado. */
  children?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** 'destructive' → botón confirmar rojo (MASTER §6: confirm destructivo rojo, separado del cancel). */
  variant?: 'default' | 'destructive'
  /** Type-to-confirm: si está seteado, confirmar queda deshabilitado hasta que se escriba exactamente esta frase. */
  confirmationPhrase?: string
  /** Handler async. Devolvé { success:false, error } para mantener el diálogo abierto y mostrar el error; void o { success:true } cierra. */
  onConfirm: () => Promise<{ success: boolean; error?: string } | void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  confirmationPhrase,
  onConfirm,
}: ConfirmDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [typed, setTyped] = useState('')

  const phraseOk = !confirmationPhrase || typed.trim() === confirmationPhrase
  const confirmDisabled = isPending || !phraseOk

  function handleOpenChange(next: boolean) {
    if (isPending) return // no cerrar mientras procesa
    if (!next) {
      setError(null)
      setTyped('')
    }
    onOpenChange(next)
  }

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const res = await onConfirm()
      if (res && res.success === false) {
        setError(res.error ?? 'No se pudo completar la acción.')
        return
      }
      setTyped('')
      onOpenChange(false)
    })
  }

  const confirmClasses =
    variant === 'destructive'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-emerald-600 hover:bg-emerald-700 text-white'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description ? (
          <div className="text-sm leading-relaxed text-slate-600">{description}</div>
        ) : null}
        {children}
        {confirmationPhrase ? (
          <div className="space-y-1">
            <label htmlFor="confirm-phrase" className="text-xs font-medium text-slate-700">
              Escribí <span className="font-mono font-semibold">{confirmationPhrase}</span> para confirmar
            </label>
            <input
              id="confirm-phrase"
              type="text"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleOpenChange(false)}
            className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={handleConfirm}
            className={`inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${confirmClasses}`}
          >
            {isPending ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
