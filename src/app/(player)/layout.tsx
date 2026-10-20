import type { ReactNode } from 'react'
import { signOutAction } from '@/modules/auth/sign-out.action'
import { getPortalSession } from '@/modules/players/portal-session'
import PortalShell from '@/components/site/PortalShell'
import { PortalWorld } from '@/components/world/PortalWorld'

export default async function PlayerLayout({ children }: { children: ReactNode }) {
  // Sin guard acá: el layout no conoce el pathname del pedido (el middleware no lo expone), así que
  // un redirect desde acá perdería el destino. Cada page.tsx del grupo (`mis-reservas`,
  // `configuracion`, `eliminar-cuenta`; `perfil` redirige a `configuracion`) hace su propio guard
  // con su `next=`; `tests/unit/player-pages-guard.test.ts` lo fija.
  // MEJORA-UX QA: sembrar la sesión del jugador (si la hay; `getPortalSession` da null sin sesión) evita el flash de header anónimo (`PortalShell` la
  // pinta como estado inicial en vez de esperar el round-trip a
  // /api/player/session). `getPortalSession()` reusa `extractAuthUser()`
  // (React.cache: no repite la lectura de auth) y solo agrega la query de
  // `getPlayerHeaderInfo`, ya cacheada por request para el resto del árbol.
  // `favoriteTenantIds` sigue hidratando client-side como siempre — no es lo
  // que este hallazgo señala y no vale la query extra acá.
  const session = await getPortalSession()

  return (
    <PortalShell
      signOutAction={signOutAction}
      initialSession={
        session ? { session, favoriteTenantIds: new Set(), staffPanelPath: null } : undefined
      }
    >
      {/* El mundo de La Reserva cubre las páginas del grupo, sus `loading.tsx` y sus `error.tsx`; los
          diálogos de Radix, que montan en <body>, los alcanza el `html:has()`. */}
      <PortalWorld>{children}</PortalWorld>
    </PortalShell>
  )
}
