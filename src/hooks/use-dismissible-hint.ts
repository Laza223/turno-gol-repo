'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Hint de primera vez descartable, persistido en localStorage por `storageKey`.
 * Arranca descartado (evita el flash antes de la hidratación) y se habilita
 * post-mount solo si nunca se descartó. Genérico: reusable por cualquier hint
 * one-shot que se recuerde entre visitas.
 */
export function useDismissibleHint(storageKey: string): {
  dismissed: boolean
  dismiss: () => void
} {
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(storageKey) === '1')
    } catch {
      /* sin storage el hint no aparece: mejor mudo que repetitivo */
    }
  }, [storageKey])
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(storageKey, '1')
    } catch {
      /* solo esta visita */
    }
    setDismissed(true)
  }, [storageKey])
  return { dismissed, dismiss }
}
