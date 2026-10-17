import { SearchX } from 'lucide-react'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'

/** Sin reserva encontrada (inexistente, purgada por RGPD, o de otro jugador vía RLS): estado neutro. */
export function ReservaNotFound() {
  return (
    <PortalResult
      icon={SearchX}
      title="No encontramos tu reserva"
      actions={<PortalResultLink href="/mis-reservas">Ver mis reservas</PortalResultLink>}
    >
      <p>Puede que ya no exista o que sea de otra cuenta. Mirá tus reservas.</p>
    </PortalResult>
  )
}
