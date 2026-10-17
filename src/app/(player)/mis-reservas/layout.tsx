import type { ReactNode } from 'react'
import { PortalWorld } from '@/components/world/PortalWorld'

// Mis reservas vive en el mundo de La Reserva (plano, un solo verde). El mundo va acá y no en
// `(player)/layout.tsx` porque Cuenta y Perfil todavía no migraron. Cubre la page, su `loading.tsx`
// y el `error.tsx`; los diálogos de Radix, que montan en <body>, los alcanza el `html:has()`.
export default function MisReservasLayout({ children }: { children: ReactNode }) {
  return <PortalWorld>{children}</PortalWorld>
}
