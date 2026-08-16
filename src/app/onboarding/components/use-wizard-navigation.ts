'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { WizardActionResult } from '@/modules/onboarding/onboarding.types'

/**
 * Lleva al paso siguiente a partir de lo que devolvió la action.
 *
 * Vive en un hook y no repetido en cada paso porque la decisión
 * `router.push` vs `window.location.assign` es fácil de olvidar en uno de los
 * tres, y olvidarla en el paso 1 reintroduce un bug de sesión que ya nos costó
 * caro (#158: la cookie nueva contra una navegación client-side, carrera que
 * WebKit móvil pierde).
 *
 * - `hardNavigate` → recarga completa: la respuesta trae `Set-Cookie` y el
 *   próximo request tiene que salir con ella aplicada.
 * - por defecto → `router.push`: conserva el árbol de React, así que la
 *   transición entre pasos se puede animar.
 */
export function useWizardNavigation() {
  const router = useRouter()

  return useCallback(
    (result: WizardActionResult) => {
      if (!result.success || !result.next) return
      if (result.hardNavigate) {
        window.location.assign(result.next)
        return
      }
      router.push(result.next)
    },
    [router],
  )
}
