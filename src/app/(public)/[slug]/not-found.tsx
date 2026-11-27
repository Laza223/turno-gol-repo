import { SearchX } from 'lucide-react'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'

export default function NotFound() {
  return (
    <PortalResult
      icon={SearchX}
      tone="neutral"
      title="No encontramos este complejo"
      actions={<PortalResultLink href="/explorar">Buscar otros complejos</PortalResultLink>}
    >
      <p>Puede que el link esté mal escrito o que ya no esté en TurnoGol.</p>
    </PortalResult>
  )
}
