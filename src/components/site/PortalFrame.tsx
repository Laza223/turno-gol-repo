'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { PlayerBottomNav, useBottomNavVisible } from './PlayerBottomNav'
import { PortalMotionProvider } from './PortalMotionProvider'

type Props = {
  header: ReactNode
  footer: ReactNode
  children: ReactNode
}

/**
 * Esqueleto visual del portal: marco, bottom-nav mobile y su relleno inferior. La barra
 * inferior se muestra siempre (con o sin sesión), así el server render es idéntico para
 * todos (requisito de ISR). header/footer/children llegan como props para que sigan
 * renderizándose en el server.
 *
 * `data-portal-glass` marca las páginas del portal de vidrio (decisión 2026-11-13): con él los
 * avisos bajan desde arriba en vidrio y la raíz no se anima al navegar (globals.css). Acá se monta
 * también el `motion` del portal, que el panel nunca carga.
 */
export default function PortalFrame({ header, footer, children }: Props) {
  const bottomNav = useBottomNavVisible()
  return (
    <div
      data-portal-glass
      className={cn(
        'flex min-h-dvh flex-col player-shell-bg',
        // Lo que ocupa la barra de abajo (`--portal-tabbar-space`: 12 px de aire + 66 px de
        // píldora + área segura). Sin esto el pie queda debajo de la barra.
        bottomNav && 'pb-(--portal-tabbar-space) md:pb-0',
        // Una página con un botón fijo abajo (`[data-fixed-cta]`, ver ConfirmBookingButton) suma su
        // alto real —1 px de borde + 12 + 52 + 12 px— al de la barra inferior, para que ni el
        // contenido ni el pie queden tapados al final del scroll. El botón se ubica siempre por
        // encima de la barra inferior, que también está siempre. Desde `md` el botón está en el
        // flujo y no hay barra inferior: vuelve a 0. `:has()` pesa más que `md:pb-0`, por eso el
        // `md:` también lleva el `has`.
        bottomNav && [
          'has-[[data-fixed-cta]]:pb-[calc(var(--portal-tabbar-space)+78px)]',
          'md:has-[[data-fixed-cta]]:pb-0',
        ],
      )}
    >
      <PortalMotionProvider>
        {header}
        <main id="main-content" className="flex-1">
          {children}
        </main>
        {footer}
        <PlayerBottomNav />
      </PortalMotionProvider>
    </div>
  )
}
