import type { ReactNode } from 'react'
import PortalShell from '@/components/site/PortalShell'

// Las páginas de retorno de reserva (éxito / pendiente / error) viven dentro
// del mismo portal: el jugador queda con cabecera + navegación, no en una
// tarjeta huérfana. El guard de sesión lo hace cada página.
export default function ReservaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark">
      <PortalShell>{children}</PortalShell>
    </div>
  )
}
