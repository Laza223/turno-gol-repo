import type { ReactNode } from 'react'
import BusinessHeader from '@/components/site/BusinessHeader'
import BusinessFooter from '@/components/site/BusinessFooter'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import './business.css'

export default function BusinessLayout({ children }: { children: ReactNode }) {
  return (
    // Portal de vidrio (decisión 2026-11-13, F8): estas páginas siguen el tema del visitante como
    // el resto del portal. El marcador prende los tokens de vidrio, y la luz de fondo es la de toda
    // página del portal. Sin barra de abajo: son páginas para el dueño, no para el jugador.
    <div data-portal-glass className="bz portal-ambient min-h-dvh text-portal-ink">
      {/* El provider envuelve SOLO al header, igual que en la home
          (src/app/page.tsx): hidrata la sesión después de montar, así que estas
          páginas siguen siendo estáticas y nada del árbol server lee cookies.
          Fail-open: si el fetch falla, el header queda como el de un visitante. */}
      <PortalSessionProvider>
        <BusinessHeader />
      </PortalSessionProvider>
      <main id="main-content">{children}</main>
      <BusinessFooter />
    </div>
  )
}
