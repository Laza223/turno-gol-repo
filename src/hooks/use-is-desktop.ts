'use client'

import { useCallback, useSyncExternalStore } from 'react'

/** `lg` de Tailwind — el mismo punto donde aparece el rail del sidebar. */
const DESKTOP_QUERY = '(min-width: 1024px)'

/**
 * ¿Estamos en un viewport de escritorio?
 *
 * Por qué un hook y no `hidden lg:flex` / `lg:hidden` (el patrón de la casa,
 * `ResponsiveList`): la grilla no es sólo layout. Sus celdas libres abren un
 * `Popover` de Radix, que **portaliza su contenido al `body`** — fuera del
 * subárbol que la clase responsive oculta. Con las dos vistas montadas, tocar
 * un slot en la lista de mobile abriría también el popover de la celda
 * equivalente de la matriz "oculta", y el formulario aparecería flotando en
 * una posición sin sentido. Con `display:none` no alcanza: el portal no está
 * adentro.
 *
 * `useSyncExternalStore` y no `useEffect`: React usa `getServerSnapshot`
 * durante la hidratación, así que no hay mismatch — el servidor y el primer
 * render del cliente coinciden, y el swap ocurre en el render siguiente.
 * El snapshot de servidor es `true` (escritorio) porque es lo que renderiza
 * hoy y porque en tests sin `matchMedia` es el comportamiento previo.
 */
export function useIsDesktop(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const mql = window.matchMedia(DESKTOP_QUERY)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true
    return window.matchMedia(DESKTOP_QUERY).matches
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
