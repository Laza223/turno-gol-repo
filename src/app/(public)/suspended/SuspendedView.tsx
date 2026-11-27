import { PauseCircle } from 'lucide-react'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'
import { RESULT_ALT } from '@/components/world/portal-result-classes'
import { SUPPORT_EMAIL } from '@/shared/constants'
import { SwitchTenantLink } from '@/app/(public)/SwitchTenantLink'

type Props = {
  /** AUD-01: la salida solo se ofrece si hay a dónde ir. Lo resuelve `page.tsx`. */
  mostrarCambioDeComplejo: boolean
}

/**
 * La pantalla, sin nada de sesión adentro.
 *
 * Vive separada de `page.tsx` porque desde AUD-01 la página resuelve la sesión,
 * y eso arrastra `node:async_hooks` — que en el navegador no existe. La story
 * importaba la página y dejó de poder cargarla. Acá el árbol es puro y se
 * renderiza igual en Storybook que en el servidor.
 */
export function SuspendedView({ mostrarCambioDeComplejo }: Props) {
  return (
    <PortalResult
      icon={PauseCircle}
      tone="neutral"
      title="Tu cuenta está temporalmente suspendida"
      actions={
        <>
          <PortalResultLink href="/reactivar">Soy el dueño: regularizar el pago</PortalResultLink>
          <PortalResultLink href={`mailto:${SUPPORT_EMAIL}`} variant="outline" external>
            Contactar a soporte
          </PortalResultLink>
          {mostrarCambioDeComplejo && <SwitchTenantLink className={RESULT_ALT} />}
          <PortalResultLink href="/" variant="outline">
            Volver al inicio
          </PortalResultLink>
        </>
      }
    >
      <p>
        El acceso al panel de tu complejo está pausado por el momento. Tus datos están a salvo y no
        se perdió nada. En cuanto se regularice la situación vas a poder volver a operar
        normalmente.
      </p>
    </PortalResult>
  )
}
