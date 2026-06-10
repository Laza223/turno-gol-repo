import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import PortalHeader from './PortalHeader'
import SiteFooter from './SiteFooter'
import { PlayerBottomNav } from './PlayerBottomNav'
import { getPortalSession } from './portal-session'

/**
 * Cascarón único del portal del jugador (público + logueado + post-reserva).
 * Misma cabecera, footer y —cuando hay sesión de jugador— el bottom-nav mobile.
 * Esto unifica los antes-divergentes layouts en una sola experiencia.
 */
export default async function PortalShell({ children }: { children: ReactNode }) {
  const session = await getPortalSession()

  return (
    <div
      className={cn(
        'flex min-h-dvh flex-col bg-background',
        session && 'pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0',
      )}
    >
      <PortalHeader variant="solid" />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      {session && <PlayerBottomNav />}
    </div>
  )
}
