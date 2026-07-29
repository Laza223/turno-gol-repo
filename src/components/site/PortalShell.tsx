import type { ReactNode } from 'react'
import PortalHeader from './PortalHeader'
import SiteFooter from './SiteFooter'
import PortalFrame from './PortalFrame'
import { PortalSessionProvider } from './PortalSessionProvider'

/**
 * Cascarón único del portal del jugador (público + logueado + post-reserva).
 * Misma cabecera, footer y —cuando hay sesión de jugador— el bottom-nav mobile.
 * La sesión se hidrata client-side (PortalSessionProvider): el shell no lee
 * cookies, así las rutas públicas pueden ser ISR/estáticas.
 *
 * `signOutAction` entra por PROP y no por import: @/components son piezas
 * reusables y no pueden depender del dominio (ver eslint.config.mjs,
 * `turnogol/capas-components`). Los layouts que lo montan viven en src/app/,
 * que sí puede importar @/modules. Mismo patrón que PortalHeader, que ya la
 * recibía así desde acá.
 */
export default function PortalShell({
  children,
  signOutAction,
}: {
  children: ReactNode
  signOutAction: () => Promise<void>
}) {
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
