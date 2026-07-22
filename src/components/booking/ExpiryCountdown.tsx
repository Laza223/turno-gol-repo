'use client'

import { useEffect, useState } from 'react'
import { formatRemaining } from './format-remaining'

export default function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  // null hasta el mount: el countdown depende del reloj, así que el texto del
  // SSR nunca coincide con el del cliente (segundos corriendo) y React tiraba
  // "Hydration failed" regenerando el árbol entero de la página — en máquinas
  // lentas eso descarta el estado del checkout a mitad de interacción.
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (now === null) return <span aria-hidden="true">–:––</span>

  const remaining = new Date(expiresAt).getTime() - now

  return <span>{formatRemaining(remaining)}</span>
}
