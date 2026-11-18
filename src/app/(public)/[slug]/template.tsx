import type { ReactNode } from 'react'
import { PortalTransition } from '@/components/site/PortalTransition'

/** Cada navegación dentro de este grupo entra y sale con la transición del portal. */
export default function Template({ children }: { children: ReactNode }) {
  return <PortalTransition>{children}</PortalTransition>
}
