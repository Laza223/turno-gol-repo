import type { ReactNode } from 'react'
import { PlayerBottomNav } from '@/components/site/PlayerBottomNav'
import PortalHeader from '@/components/site/PortalHeader'
import { PortalMotionProvider } from '@/components/site/PortalMotionProvider'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import { HeroBackdrop } from './HeroBackdrop'
import './portal-app.css'
import '@/components/booking/reserva.css'

/**
 * Marco de /ingresar, /aceptar-terminos y los estados de jugador de /verify, en el portal de vidrio:
 * el cromo del portal (la cabecera con el tema y la barra de abajo, como en el resto del portal),
 * la foto del hero de fondo (sin el reflejo) y una columna centrada. Cada pantalla arma adentro su
 * título y su tarjeta (`.pa-auth__card glass`). Sigue el tema claro u oscuro: el marcador
 * `data-portal-glass` es el que prende los tokens del portal. No es `PortalFrame`: el layout de
 * `(auth)` ya pone el `<main>`, y acá no va el pie.
 *
 * `signOutAction` entra por prop (como en `PortalShell`): `@/components` no puede importar dominio.
 * La usa el menú de la cuenta de la cabecera, que aparece en /aceptar-terminos (ya hay sesión).
 */
export function PortalAuthFrame({
  children,
  signOutAction,
}: {
  children: ReactNode
  signOutAction: () => Promise<void>
}) {
  return (
    <PortalSessionProvider>
      <div data-auth-frame data-portal-glass className="portal-ambient min-h-dvh text-portal-ink">
        <PortalMotionProvider>
          <PortalHeader signOutAction={signOutAction} />
          <div className="pa-auth">
            <HeroBackdrop />
            <div className="pa-auth__col">{children}</div>
          </div>
          <PlayerBottomNav />
        </PortalMotionProvider>
      </div>
    </PortalSessionProvider>
  )
}
