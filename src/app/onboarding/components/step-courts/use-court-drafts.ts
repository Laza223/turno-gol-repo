'use client'

import { useState } from 'react'
import type { CourtRow } from '@/modules/courts/court.types'
import type { Draft } from './constants'

/**
 * Estado de los borradores de cancha del paso 3 del wizard: alta/baja, edición
 * inline y qué tarjetas están expandidas. Separado de StepCourts para que el
 * componente quede como orquestador de layout + submit (que sí toca las Server
 * Actions). `existingCourts` sólo se lee para sembrar el primer draft y derivar
 * `canRemove` / el número de la próxima cancha.
 */
export function useCourtDrafts(existingCourts: CourtRow[]) {
  const [nextKey, setNextKey] = useState(2)
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    existingCourts.length > 0
      ? []
      : [
          {
            key: 1,
            name: 'Cancha 1',
            format: 5,
            surfaceType: 'synthetic_grass',
            isCovered: false,
            price: '',
          },
        ],
  )
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(() => new Set([1]))

  function toggleExpand(key: number) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  /** Fuerza abrir un draft (submit expande el inválido para mostrar el error). */
  function expand(key: number) {
    setExpandedKeys((prev) => new Set(prev).add(key))
  }

  function updateDraft(key: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  function addDraft() {
    const last = drafts.at(-1)
    const n = existingCourts.length + drafts.length + 1
    const newKey = nextKey

    setDrafts((prev) => [
      ...prev,
      {
        key: newKey,
        name: `Cancha ${n}`,
        format: last?.format ?? 5,
        surfaceType: last?.surfaceType ?? 'synthetic_grass',
        isCovered: last?.isCovered ?? false,
        price: last?.price ?? '',
      },
    ])
    // Colapsa las anteriores y expande solo la recién creada para mantener la vista limpia.
    setExpandedKeys(new Set([newKey]))
    setNextKey((k) => k + 1)
  }

  function removeDraft(key: number) {
    setDrafts((prev) => prev.filter((d) => d.key !== key))
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const canRemove = drafts.length > 1 || existingCourts.length > 0

  return {
    drafts,
    expandedKeys,
    canRemove,
    toggleExpand,
    expand,
    updateDraft,
    addDraft,
    removeDraft,
  }
}
