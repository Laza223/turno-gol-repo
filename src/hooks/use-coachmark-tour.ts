'use client'

import { useEffect, useRef, useState } from 'react'

export interface CoachmarkTourStep {
  targetId: string
  text: string
}

export interface UseCoachmarkTourOptions {
  onFinish: () => void
}

export interface UseCoachmarkTourResult {
  /** Paso actual, o `null` si el tour ya terminó. */
  current: CoachmarkTourStep | null
  index: number
  total: number
  /** Avanza al próximo paso; en el último, termina el tour (llama `onFinish`). */
  next: () => void
  /** Corta el tour ahí mismo, sin pasar por los pasos restantes. */
  skip: () => void
  active: boolean
}

/**
 * Orquesta una secuencia de coachmarks (MASTER §7.1: máximo UNO visible a la
 * vez). No sabe nada de posicionamiento — eso es responsabilidad de
 * `Coachmark`; acá solo vive el índice del paso y la lógica de avance/salto.
 *
 * Skip defensivo: si el anchor (`[data-tour-id]`) del paso actual no está en
 * el DOM (vista distinta, elemento condicional que no se llegó a renderizar),
 * salta al siguiente paso automáticamente, y si no queda ninguno, termina el
 * tour. Corre en un efecto (client-only) al montar y en cada avance.
 */
export function useCoachmarkTour(
  steps: CoachmarkTourStep[],
  opts: UseCoachmarkTourOptions,
): UseCoachmarkTourResult {
  const total = steps.length
  const [index, setIndex] = useState(0)
  const active = index < total
  const { onFinish } = opts

  // `finishedRef` (no un ref con la última versión de onFinish, mutarlo
  // durante el render viola react-hooks/refs) asegura que onFinish dispare
  // UNA sola vez aunque el efecto se re-ejecute porque el caller pasó una
  // función nueva en cada render (identidad inestable es la norma en
  // componentes de función).
  const finishedRef = useRef(false)

  useEffect(() => {
    if (index >= total && !finishedRef.current) {
      finishedRef.current = true
      onFinish()
    }
  }, [index, total, onFinish])

  useEffect(() => {
    if (!active) return
    const step = steps[index]
    if (!step) return
    if (!document.querySelector(`[data-tour-id="${step.targetId}"]`)) {
      // Skip defensivo: la decisión depende de si el anchor EXISTE en el DOM,
      // que es justamente lo que no se puede saber durante el render. Encadena
      // un render a propósito (avanza al paso siguiente y vuelve a preguntar),
      // y termina solo: `active` es false cuando se acaban los pasos.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIndex((i) => i + 1)
    }
    // `steps` se asume estable (constante a nivel de módulo en el caller).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, active])

  const next = () => setIndex((i) => i + 1)
  const skip = () => setIndex(total)

  return {
    current: active ? (steps[index] ?? null) : null,
    index,
    total,
    next,
    skip,
    active,
  }
}
