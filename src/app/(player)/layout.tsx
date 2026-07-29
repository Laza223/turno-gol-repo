import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { signOutAction } from '@/modules/auth/sign-out.action'
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

  return <PortalShell signOutAction={signOutAction}>{children}</PortalShell>
}
