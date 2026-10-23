'use client'

import { useEffect } from 'react'
import { dropUrlParam } from './drop-url-param'

/**
 * El intento de RIVAL se gasta al entrar, se sume o no: también vuelven del login con él el
 * organizador, quien ya está adentro o quien abre un partido que se cayó, y ninguno monta
 * `VoyPanel`. Si la URL lo conserva, un re-render posterior lo volvería a leer.
 *
 * Diferido a propósito: en la hidratación este efecto corre ANTES que el del AppRouter, que es el
 * que engancha `history.replaceState` al router. Sin esperar, el router conserva la URL con el
 * token y la repone después de la próxima acción.
 */
export function DropIntentParam({ param }: { param: string }) {
  useEffect(() => {
    const timer = window.setTimeout(() => dropUrlParam(param), 0)
    return () => window.clearTimeout(timer)
  }, [param])
  return null
}
