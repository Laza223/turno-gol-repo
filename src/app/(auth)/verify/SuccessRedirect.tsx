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
    <p className="mt-4 text-xs text-slate-500" aria-live="polite">
      Te llevamos automáticamente en {remaining}s…
    </p>
  )
}
