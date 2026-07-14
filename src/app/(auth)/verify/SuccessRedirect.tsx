'use client'

import { useEffect, useState } from 'react'

const SECONDS = 5

/**
 * Auto-redirect a `next` a los 5s con cuenta regresiva visible. El botón
 * Continuar de la página es el fallback inmediato y no-JS; este island solo
 * agrega la conveniencia del redirect automático. `next` ya viene sanitizado.
 */
export default function SuccessRedirect({ next }: { next: string }) {
  const [remaining, setRemaining] = useState(SECONDS)

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    const timeout = setTimeout(() => {
      window.location.assign(next)
    }, SECONDS * 1000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [next])

  return (
    // slate-500 (#64748b) sobre la card de /verify daba 3.91:1 — abajo del 4.5 que pide
    // AA para 12px. Es un gris del medio: no llega ni contra fondo claro ni contra
    // oscuro. slate-400 sobre esta card (siempre oscura) da 7.33:1.
    <p className="mt-4 text-xs text-slate-400" aria-live="polite">
      Te llevamos automáticamente en {remaining}s…
    </p>
  )
}
