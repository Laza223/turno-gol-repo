'use client'

import { useCallback, useEffect, useState } from 'react'

const DENSITY_STORAGE_KEY = 'tg-grilla-density'

/**
 * Densidad de la grilla persistida en localStorage (pages/grilla.md §4). Se lee
 * post-mount para no desincronizar la hidratación (arranca en 'comfortable').
 */
export function usePersistedDensity(): { isCompact: boolean; toggleDensity: () => void } {
  const [isCompact, setIsCompact] = useState(false)
  useEffect(() => {
    try {
      setIsCompact(localStorage.getItem(DENSITY_STORAGE_KEY) === 'compact')
    } catch {
      /* storage bloqueado: densidad por defecto */
    }
  }, [])
  const toggleDensity = useCallback(() => {
    setIsCompact((prev) => {
      const next = !prev
      try {
        localStorage.setItem(DENSITY_STORAGE_KEY, next ? 'compact' : 'comfortable')
      } catch {
        /* no persiste, pero el toggle funciona en la sesión */
      }
      return next
    })
  }, [])
  return { isCompact, toggleDensity }
}
