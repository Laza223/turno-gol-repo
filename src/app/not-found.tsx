import PortalShell from '@/components/site/PortalShell'
import { NotFoundView } from '@/components/world/NotFoundView'
import { signOutAction } from '@/modules/auth/sign-out.action'

/**
 * El 404 de una URL que no matchea ninguna ruta: se dibuja solo con el layout raíz, así que pone el
 * cromo del portal. Los `notFound()` de adentro de `(public)` y `(business)` caen en el
 * `not-found.tsx` de su grupo, que no lo repite.
 */
export default function NotFound() {
  return (
    <PortalShell signOutAction={signOutAction}>
      <NotFoundView />
    </PortalShell>
  )
}
