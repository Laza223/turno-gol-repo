'use client'

import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { AccountMenu } from './AccountMenu'
import { IngresarLink } from './IngresarLink'
import { usePortalSession } from './PortalSessionProvider'
import { Search, Building2, Calendar } from 'lucide-react'

type Props = {
  /** Threaded a AccountMenu — ver el comentario de la prop homónima ahí. */
  signOutAction: () => Promise<void>
}

// El anillo de foco se separa con el color de la barra (card en claro,
// background en oscuro): con `ring-offset-background` pelado, sobre las páginas del panel
// quedaba un aro slate dentro de una barra blanca.
const focusCls =
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card dark:focus-visible:ring-offset-background'
const navLinkCls = `min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground ${focusCls}`
// Texto verde sin relleno ni borde, como el boceto. `-mr-1` + `px-1`: el texto queda a ras
// del margen de la página. La separación entre ítems es el `gap` de la nav, no el padding.
const ctaLinkCls = `-mr-1 inline-flex min-h-11 min-w-11 items-center justify-end whitespace-nowrap rounded-md px-1 text-[15px] font-semibold text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400 ${focusCls}`

/**
 * Cabecera única del portal, session-aware. Reemplaza al antiguo `SiteNav`.
 * - Deslogueado: un único CTA "Ingresar" → /ingresar?next=<página actual>.
 * - Jugador logueado: chip de avatar + nombre con menú de cuenta.
 * La sesión llega del PortalSessionProvider (hidratación client-side): el HTML
 * server-rendered es siempre el estado anónimo (habilita ISR) y el chip del
 * jugador aparece tras montar, ocupando el mismo slot derecho de la nav.
 * Es el cromo plano de La Reserva: solo tokens semánticos, así se ve igual con los del
 * panel (páginas sin migrar) y con los del mundo del portal.
 */
export default function PortalHeader({ signOutAction }: Props) {
  const { session, staffPanelPath } = usePortalSession()

  // Precedencia: el jugador gana siempre. En la práctica son cookies
  // mutuamente excluyentes (un solo auth user por navegador), pero el orden lo
  // deja determinístico. `staffPanelPath` es el acceso del COMPLEJO logueado
  // que llega a una página pública: antes veía "Ingresar" y volvía al login.

  return (
    <header className="sticky top-0 z-50 h-14 w-full border-b border-border bg-card dark:bg-background">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="TurnoGol — inicio"
          className={`inline-flex min-h-11 shrink-0 items-center rounded-md transition-opacity hover:opacity-90 ${focusCls}`}
        >
          {/* 18 px debajo de 375 (a 320 la barra de un complejo no entra con más), 22 px desde 375 (el del boceto) y 24 desde sm. */}
          <Logo
            variant="horizontal"
            textClassName="text-foreground text-lg min-[375px]:text-[22px] sm:text-2xl"
          />
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4">
          {/* Debajo de 375 px el ícono de Explorar se va: a 320 el texto es lo que importa. */}
          <Link href="/explorar" className={`flex ${navLinkCls}`}>
            <Search className="hidden h-4 w-4 min-[375px]:block" aria-hidden />
            Explorar
          </Link>
          {session ? (
            <>
              <Link href="/mis-reservas" className={`hidden sm:flex ${navLinkCls}`}>
                <Calendar className="h-4 w-4" aria-hidden />
                Mis reservas
              </Link>
              <AccountMenu
                firstName={session.firstName}
                lastName={session.lastName}
                email={session.email}
                avatarUrl={session.avatarUrl}
                signOutAction={signOutAction}
              />
            </>
          ) : (
            <>
              <Link href="/para-complejos" className={`hidden sm:flex ${navLinkCls}`}>
                <Building2 className="h-4 w-4" aria-hidden />
                Para complejos
              </Link>
              {staffPanelPath ? (
                <Link href={staffPanelPath} className={ctaLinkCls}>
                  Ir a mi panel
                </Link>
              ) : (
                <IngresarLink className={ctaLinkCls}>Ingresar</IngresarLink>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
