'use client'

import Link from 'next/link'
import { usePortalSession } from './PortalSessionProvider'

/**
 * "Tablón de Rival" en el pie, solo con el flag `rival` prendido. Va aparte porque el flag llega
 * del `PortalSessionProvider` (cliente) y el pie sigue siendo un componente de servidor.
 */
export function FooterRivalLink({ className }: { className: string }) {
  const { rivalEnabled } = usePortalSession()
  if (!rivalEnabled) return null
  return (
    <li>
      <Link href="/rival" className={className}>
        Tablón de Rival
      </Link>
    </li>
  )
}
