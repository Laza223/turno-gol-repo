import type { ReactNode } from 'react'
import PortalShell from '@/components/site/PortalShell'
import { PortalWorld } from '@/components/world/PortalWorld'
import { signOutAction } from '@/modules/auth/sign-out.action'

// Las páginas de retorno de reserva (éxito / pendiente / error) viven dentro
// del mismo portal: el jugador queda con cabecera + navegación, no en una
// tarjeta huérfana, y en el mundo de La Reserva (plano, un solo verde). El
// mundo va adentro del cascarón, que cubre las tres páginas, sus `loading.tsx`
// y el `error.tsx`. El guard de sesión lo hace cada página.
export default function ReservaLayout({ children }: { children: ReactNode }) {
  return (
    <PortalShell signOutAction={signOutAction}>
      <PortalWorld>{children}</PortalWorld>
    </PortalShell>
  )
}
