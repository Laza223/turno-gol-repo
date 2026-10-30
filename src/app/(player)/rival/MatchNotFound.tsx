import { CalendarX } from 'lucide-react'
import GlobalNotFound from '@/app/not-found'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'
import { isRivalEnabled } from '@/modules/rival/rival.flags'

/**
 * Un partido que no existe (o ya no se ve), en el cascarón de La Previa y con salida a RIVAL. Solo
 * para los links de un partido (`/p/[code]`, `/partido/[id]`). Con el flag apagado es el 404 del
 * sitio: sin flag, RIVAL es como si no existiera y no se delata con textos ni links.
 */
export async function MatchNotFound() {
  if (!(await isRivalEnabled())) return <GlobalNotFound />
  return (
    <PortalResult
      icon={CalendarX}
      tone="neutral"
      title="Este partido ya no está"
      actions={<PortalResultLink href="/rival/tablon">Ver el tablón</PortalResultLink>}
    >
      <p>Pudo llenarse, empezar o cancelarse.</p>
    </PortalResult>
  )
}
