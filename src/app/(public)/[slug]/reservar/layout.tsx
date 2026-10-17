import type { ReactNode } from 'react'
import { PortalWorld } from '@/components/world/PortalWorld'

/**
 * Monta el mundo del portal sobre la pantalla de confirmar y su `loading.tsx` (un layout queda
 * fuera del boundary de su propio segmento, así que el skeleton también cae adentro). Mismo
 * patrón que `(perfil)/layout.tsx`.
 */
export default function ReservarLayout({ children }: { children: ReactNode }) {
  return <PortalWorld>{children}</PortalWorld>
}
