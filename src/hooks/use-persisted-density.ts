'use client'

import { useCallback } from 'react'
import { usePersistedFlag } from './use-persisted-flag'

const DENSITY_STORAGE_KEY = 'tg-grilla-density'

/**
 * Densidad de la grilla persistida en localStorage (pages/grilla.md §4). Se lee
 * post-hidratación para no desincronizar el HTML del servidor (arranca en
 * 'comfortable').
 */
export function usePersistedDensity(): { isCompact: boolean; toggleDensity: () => void } {
  const [isCompact, setIsCompact] = usePersistedFlag(DENSITY_STORAGE_KEY, {
    on: 'compact',
    off: 'comfortable',
    serverValue: false,
  })
  const toggleDensity = useCallback(() => {
    setIsCompact(!isCompact)
  }, [isCompact, setIsCompact])
  return { isCompact, toggleDensity }
}
