import type { ReactNode } from 'react'
import PortalHeader from './PortalHeader'
import SiteFooter from './SiteFooter'
import PortalFrame from './PortalFrame'
import { PortalSessionProvider } from './PortalSessionProvider'
import { signOutAction } from '@/modules/auth/sign-out.action'

/**
 * Cascarón único del portal del jugador (público + logueado + post-reserva).
 * Misma cabecera, footer y —cuando hay sesión de jugador— el bottom-nav mobile.
 * La sesión se hidrata client-side (PortalSessionProvider): el shell no lee
 * cookies, así las rutas públicas pueden ser ISR/estáticas.
 */
export default function PortalShell({ children }: { children: ReactNode }) {
  return (
    <PortalSessionProvider>
      <PortalFrame
        header={<PortalHeader variant="solid" signOutAction={signOutAction} />}
        footer={<SiteFooter />}
      >
        {children}
      </PortalFrame>
    </PortalSessionProvider>
  )
}
