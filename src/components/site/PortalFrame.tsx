'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { PlayerBottomNav } from './PlayerBottomNav'
import { usePortalSession } from './PortalSessionProvider'

type Props = {
  header: ReactNode
  footer: ReactNode
  children: ReactNode
}

/**
 * Esqueleto visual del portal (client): el padding inferior y el bottom-nav
 * dependen de la sesión hidratada client-side, así el server render es idéntico
 * para todos (requisito de ISR). header/footer/children llegan como props para
 * que sigan renderizándose en el server.
 */
export default function PortalFrame({ header, footer, children }: Props) {
  const { session } = usePortalSession()

  return (
    <div
      className={cn(
        'flex min-h-dvh flex-col player-shell-bg',
        // Alto real de la barra inferior: 56 px de ítems + 1 px de borde (+ safe-area). Con más
        // padding queda una franja de `player-shell-bg` entre el pie y la barra.
        session && 'pb-[calc(3.5rem+1px+env(safe-area-inset-bottom))] md:pb-0',
        // Una página con un botón fijo abajo (`[data-fixed-cta]`, ver ConfirmBookingButton) suma su
        // alto real —1 px de borde + 12 + 52 + 12 px— al de la barra inferior y al área segura,
        // para que ni el contenido ni el pie queden tapados al final del scroll. NO depende de la
        // sesión: el botón se ubica siempre por encima de la barra inferior, y mientras la sesión
        // se hidrata el marco ya reserva el mismo lugar, así nada salta. Desde `md` el botón está
        // en el flujo y no hay barra inferior: vuelve a 0. `:has()` pesa más que `md:pb-0`, por eso
        // el `md:` también lleva el `has`.
        'has-[[data-fixed-cta]]:pb-[calc(3.5rem+1px+env(safe-area-inset-bottom)+77px)]',
        'md:has-[[data-fixed-cta]]:pb-0',
      )}
    >
      {header}
      <main id="main-content" className="flex-1">
        {children}
      </main>
      {footer}
      {session && <PlayerBottomNav />}
    </div>
  )
}
