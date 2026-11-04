import type { ReactNode } from 'react'
import { signOutAction } from '@/modules/auth/sign-out.action'
import { getPortalSession } from '@/modules/players/portal-session'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { getRivalWelcomeState } from '@/modules/rival/rival.service'
import PortalShell from '@/components/site/PortalShell'

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
  //
  // Con la sesión sembrada el provider NO consulta /api/player/session, así que el flag de RIVAL
  // se siembra acá también (si no, la barra inferior perdería "Rival" en estas páginas). Este
  // layout ya es dinámico por las cookies: no cambia nada del cacheo de las rutas públicas.
  const [session, rivalEnabled] = await Promise.all([
    getPortalSession(),
    isRivalEnabled().catch(() => false),
  ])

  const rivalWelcomed =
    session && rivalEnabled
      ? await getRivalWelcomeState(session.playerId)
          .then((s) => s?.welcomed === true)
          .catch(() => false)
      : false

  return (
    <PortalShell
      signOutAction={signOutAction}
      initialSession={
        session
          ? {
              session,
              favoriteTenantIds: new Set(),
              staffPanelPath: null,
              rivalEnabled,
              rivalWelcomed,
            }
          : undefined
      }
    >
      {/* Bordes de campo y foco a 3:1 en todo el grupo, diálogos incluidos (ver globals.css). */}
      <div data-portal-fields className="contents">
        {children}
      </div>
    </PortalShell>
  )
}
