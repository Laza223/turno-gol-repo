'use client'

import type { ActionResult } from '@/shared/types/action-result'
import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  /** Lista de consecuencias concretas (con montos/plazos reales, no genéricas —
   *  visión v2 §6.2: "una confirmación que no informa entrena el click ciego").
   *  Reemplaza el `<ul><li>` que cada caller armaba a mano dentro de `description`. */
  consequences?: string[]
  /** Campos extra (motivo, radios de reembolso, etc.) entre la descripción y el footer. El padre controla su estado. */
  children?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** 'destructive' → botón confirmar rojo (MASTER §6: confirm destructivo rojo, separado del cancel). */
  variant?: 'default' | 'destructive'
  /** Type-to-confirm: si está seteado, confirmar queda deshabilitado hasta que se escriba exactamente esta frase. */
  confirmationPhrase?: string
  /** Handler async. Devolvé `{ success:false, error }` para mantener el diálogo
   *  abierto y mostrar el error; `void` o `{ success:true }` cierra. El tipo es
   *  la unión discriminada compartida a propósito: con la versión laxa
   *  (`{ success: boolean; error?: string }`) que este archivo declaraba inline,
   *  un `{ success:false }` sin motivo compilaba y el usuario terminaba viendo
   *  el fallback genérico en vez del error real. */
  onConfirm: () => Promise<ActionResult | void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences,
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
      try {
        const res = await onConfirm()
        if (res && res.success === false) {
          setError(res.error ?? 'No se pudo completar la acción.')
          return
        }
        setTyped('')
        onOpenChange(false)
      } catch (err) {
        // #17: si onConfirm lanza (ej. error DB inesperado, re-throw), sin este
        // catch la transicion quedaba rechazada y el modal colgado en
        // "Procesando…". Reportamos a Sentry y mostramos error inline sin cerrar.
        Sentry.captureException(err)
        setError('No se pudo completar la acción. Revisá tu conexión e intentá de nuevo.')
      }
    })
  }

  const confirmClasses =
    variant === 'destructive'
      ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
      : 'bg-primary hover:bg-primary/90 text-primary-foreground'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description ? (
          <div className="text-sm leading-relaxed text-muted-foreground">{description}</div>
        ) : null}
        {consequences && consequences.length > 0 ? (
          <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-muted-foreground">
            {consequences.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}
        {children}
        {confirmationPhrase ? (
          <div className="space-y-1">
            <label htmlFor="confirm-phrase" className="text-xs font-medium text-foreground">
              Escribí <span className="font-mono font-semibold">{confirmationPhrase}</span> para
              confirmar
            </label>
            <input
              id="confirm-phrase"
              type="text"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              // F-008 (QA prod 2026-08-17): text-base md:text-sm, no text-sm plano — el piso de
              // 16px de globals.css ya lo cubre en producción, pero el primitivo no debe mentir
              // sobre su tamaño (mismo criterio que ui/input.tsx).
              className="h-11 md:h-10 w-full rounded-md border border-border bg-card text-foreground px-3 text-base md:text-sm focus:border-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleOpenChange(false)}
            className="h-11 md:h-10 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={handleConfirm}
            className={`inline-flex h-11 md:h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${confirmClasses}`}
          >
            {isPending ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
