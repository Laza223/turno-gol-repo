import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { signOutAction } from '@/modules/auth/sign-out.action'
import { getPortalSession } from '@/modules/players/portal-session'
import PortalShell from '@/components/site/PortalShell'

export default async function PlayerLayout({ children }: { children: ReactNode }) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') {
    // Layout compartido por varias rutas hijas: no conocemos el pathname real
    // acá (sin middleware que lo inyecte via headers). Cada page.tsx hijo ya
    // tiene su propio guard más específico con el next= correcto; este es
    // solo el fallback cuando el layout gana la carrera de renderizado.
    redirect(`/ingresar?next=${encodeURIComponent('/mis-reservas')}`)
  }

  // MEJORA-UX QA: acá arriba ya confirmamos que hay un jugador logueado —
  // sembrar esa sesión evita el flash de header anónimo (`PortalShell` la
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
      {children}
    </PortalShell>
  )
}
