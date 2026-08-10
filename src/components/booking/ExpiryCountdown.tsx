'use client'

import { useNowMsAfterHydration } from '@/hooks/use-now'
import { formatRemaining } from './format-remaining'

/** Un tick por segundo: es un countdown, el usuario ve correr los segundos. */
const ONE_SECOND = 1000

export default function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  // `0` hasta hidratar: el countdown depende del reloj, así que el texto del
  // SSR nunca coincide con el del cliente (segundos corriendo) y React tiraba
  // "Hydration failed" regenerando el árbol entero de la página — en máquinas
  // lentas eso descarta el estado del checkout a mitad de interacción.
  //
  // El tick sale del store compartido (`use-now.ts`) en vez de un setInterval
  // propio dentro de un efecto: mismo comportamiento, sin setState encadenado.
  const now = useNowMsAfterHydration(ONE_SECOND)

  if (now === 0) return <span aria-hidden="true">–:––</span>

  const remaining = new Date(expiresAt).getTime() - now

  return <span>{formatRemaining(remaining)}</span>
}
