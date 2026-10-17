import type { ReactNode } from 'react'
import { PortalWorld } from '@/components/world/PortalWorld'

/**
 * Monta el mundo del portal sobre la ficha del complejo y su `loading.tsx` (un layout queda fuera
 * del boundary de su propio segmento, así que el skeleton también cae adentro). `torneos/*`
 * queda afuera a propósito: no es parte de este rediseño.
 */
export default function PerfilLayout({ children }: { children: ReactNode }) {
  return <PortalWorld>{children}</PortalWorld>
}
