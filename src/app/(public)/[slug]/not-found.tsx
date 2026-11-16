import { SearchX } from 'lucide-react'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'

export default function NotFound() {
  return (
    <PortalResult
      icon={SearchX}
      tone="neutral"
      title="Complejo no encontrado"
      actions={<PortalResultLink href="/">Volver al inicio</PortalResultLink>}
    >
      <p>No encontramos este complejo. ¿Buscás otro?</p>
    </PortalResult>
  )
}
