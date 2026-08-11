'use client'

import { useCallback } from 'react'
import { usePersistedFlag } from './use-persisted-flag'

/**
 * Hint de primera vez descartable, persistido en localStorage por `storageKey`.
 * Arranca descartado (evita el flash antes de la hidratación) y se habilita
 * apenas hidrata, solo si nunca se descartó. Genérico: reusable por cualquier
 * hint one-shot que se recuerde entre visitas.
 */
export function useDismissibleHint(storageKey: string): {
  dismissed: boolean
  dismiss: () => void
} {
  const [dismissed, setDismissed] = usePersistedFlag(storageKey, {
    on: '1',
    off: '0',
    serverValue: true,
  })
  const dismiss = useCallback(() => setDismissed(true), [setDismissed])
  return { dismissed, dismiss }
}
