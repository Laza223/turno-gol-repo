'use client'

import { useLayoutEffect, useSyncExternalStore } from 'react'

const SEEN_KEY = 'turnogol:home-entrada'
const noop = () => () => {}

/**
 * La entrada de la home no se repite al volver a ella dentro de la misma visita (dirección §4.8).
 * En la primera carga la animación arranca con el HTML del servidor; si se llega a la home por
 * navegación interna y la entrada ya se vio, pone `data-home-seen` en `<html>` antes de que el
 * navegador pinte, y `home.css` la apaga. Una recarga es otra carga: ahí la entrada vuelve.
 */
export function HomeEntry() {
  // `true` solo mientras se hidrata el HTML del servidor; en una navegación interna es `false`.
  const hydrating = useSyncExternalStore(
    noop,
    () => false,
    () => true,
  )

  useLayoutEffect(() => {
    const root = document.documentElement
    let seen = false
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === '1'
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      // Storage bloqueado: la entrada sale cada vez, como antes.
    }
    if (seen && !hydrating) root.dataset.homeSeen = ''
    return () => {
      delete root.dataset.homeSeen
    }
    // Solo al montar: lo que importa es cómo se llegó a la home.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
