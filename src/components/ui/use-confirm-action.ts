'use client'

import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import type { ActionResult } from '@/shared/types/action-result'

/**
 * La lógica de una confirmación, compartida por `ConfirmDialog` (el modal del panel) y
 * `GlassConfirmSheet` (la hoja del portal de vidrio): la frase escrita, el pendiente, el error
 * inline y el cierre. Archivo aparte para que el panel no cargue `motion` con la hoja.
 */
export function useConfirmAction({
  onOpenChange,
  onConfirm,
  confirmationPhrase,
  phraseMatch = 'exact',
}: {
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<ActionResult | void>
  confirmationPhrase?: string
  phraseMatch?: 'exact' | 'email'
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [typed, setTyped] = useState('')

  const isEmailMatch = phraseMatch === 'email'
  const phraseOk =
    !confirmationPhrase ||
    (isEmailMatch
      ? typed.trim().toLowerCase() === confirmationPhrase.trim().toLowerCase()
      : typed.trim() === confirmationPhrase)
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
          // Después del await, un set* suelto ya no es parte de la transición: se pintaba un
          // render antes de que `pending` bajara, con los controles todavía deshabilitados.
          startTransition(() => setError(res.error ?? 'No se pudo completar la acción.'))
          return
        }
        setTyped('')
        onOpenChange(false)
      } catch (err) {
        // #17: si onConfirm lanza (ej. error DB inesperado, re-throw), sin este
        // catch la transicion quedaba rechazada y el modal colgado en
        // "Procesando…". Reportamos a Sentry y mostramos error inline sin cerrar.
        // El texto NO manda a reintentar a ciegas: si lo que se perdió fue la
        // respuesta, la acción pudo haberse hecho igual.
        Sentry.captureException(err)
        startTransition(() =>
          setError('No pudimos confirmar si se hizo. Revisá antes de volver a intentar.'),
        )
      }
    })
  }

  return {
    isPending,
    error,
    typed,
    setTyped,
    isEmailMatch,
    phraseOk,
    confirmDisabled,
    handleOpenChange,
    handleConfirm,
  }
}
