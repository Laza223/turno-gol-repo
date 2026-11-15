import { headers } from 'next/headers'
import { signOutAction } from '@/modules/auth/sign-out.action'
import { PortalAuthFrame } from '@/components/world/PortalAuthFrame'
import { isInAppBrowser } from '@/lib/in-app-browser'
import { sanitizeNext } from '@/lib/safe-redirect'
import { playerLoginAction, startGoogleLoginFromIngresar } from './actions'
import { IngresarForm, type RivalIngreso } from './IngresarForm'

/** Quien viene de RIVAL (`next` ya sanitizado, mismo helper que la action) ve el ingreso en su idioma. */
function rivalIngreso(next: unknown): RivalIngreso | undefined {
  const path = sanitizeNext(next, '')
  if (!/^\/rival(?:[/?#]|$)/.test(path) || path.includes('..')) return undefined
  return path.startsWith('/rival/mis-partidos') ? 'partidos' : 'general'
}

export default async function IngresarPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string | string[] }>
} = {}) {
  const rival = rivalIngreso((await searchParams)?.next)
  // El navegador interno se resuelve acá, con el header, y baja como prop: así el orden de
  // Google y el email ya viene en el HTML y no salta al hidratar.
  const inAppBrowser = isInAppBrowser((await headers()).get('user-agent'))

  return (
    <PortalAuthFrame signOutAction={signOutAction}>
      <IngresarForm
        action={playerLoginAction}
        googleAction={startGoogleLoginFromIngresar}
        inAppBrowser={inAppBrowser}
        rival={rival}
      />
    </PortalAuthFrame>
  )
}
