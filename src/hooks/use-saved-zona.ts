'use client'

import { useCallback, useMemo } from 'react'
import {
  mergeZona,
  parseZona,
  serializeZona,
  ZONA_STORAGE_KEY,
  type SavedZona,
} from '@/lib/zona-storage'
import { usePersistedString } from './use-persisted-flag'

/**
 * La zona guardada del jugador y cómo actualizarla (merge, no reemplazo: el toolbar de
 * /explorar guarda solo coordenadas sin pisar la ciudad que eligió el hero).
 *
 * `null` en el servidor y durante la hidratación; el valor real llega en el render siguiente.
 * El setter es estable y mergea contra el valor vigente, así que sirve en deps de un efecto.
 */
export function useSavedZona(): readonly [SavedZona | null, (patch: SavedZona) => void] {
  const [raw, setRaw] = usePersistedString(ZONA_STORAGE_KEY, null)
  const zona = useMemo(() => parseZona(raw), [raw])

  const save = useCallback(
    (patch: SavedZona) => {
      setRaw((prev) => serializeZona(mergeZona(parseZona(prev), patch)))
    },
    [setRaw],
  )

  return [zona, save] as const
}
