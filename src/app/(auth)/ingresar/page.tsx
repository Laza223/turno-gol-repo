import { headers } from 'next/headers'
import { PortalAuthFrame } from '@/components/world/PortalAuthFrame'
import { isInAppBrowser } from '@/lib/in-app-browser'
import { playerLoginAction, startGoogleLoginFromIngresar } from './actions'
import { IngresarForm } from './IngresarForm'

export default async function IngresarPage() {
  // El navegador interno se resuelve acá, con el header, y baja como prop: así el orden de
  // Google y el email ya viene en el HTML y no salta al hidratar.
  const inAppBrowser = isInAppBrowser((await headers()).get('user-agent'))

  return (
    <PortalAuthFrame>
      <IngresarForm
        action={playerLoginAction}
        googleAction={startGoogleLoginFromIngresar}
        inAppBrowser={inAppBrowser}
      />
    </PortalAuthFrame>
  )
}
