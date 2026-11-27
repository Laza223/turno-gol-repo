'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Logo } from '@/components/ui/logo'
import { ThemeButton } from '@/components/theme/ThemeButton'
import { AccountMenu } from './AccountMenu'
import type { PushSubscriptionActions } from '@/components/admin/push-browser'
import { IngresarLink } from './IngresarLink'
import { usePortalSession } from './PortalSessionProvider'

type Props = {
  variant?: 'overlay' | 'solid'
  /** Threaded a AccountMenu — ver el comentario de la prop homónima ahí. */
  signOutAction: () => Promise<void>
  /** Push del jugador: "Salir" baja este dispositivo antes de cerrar la sesión. */
  pushActions?: PushSubscriptionActions
}

/** Pasados `px` de scroll. Cambia una sola vez al cruzar el umbral: no sigue el scroll cuadro a cuadro. */
function useScrolledPast(px: number): boolean {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const check = () => setPast(window.scrollY > px)
    check()
    window.addEventListener('scroll', check, { passive: true })
    return () => window.removeEventListener('scroll', check)
  }, [px])
  return past
}

const AUTH_PATHS = ['/ingresar', '/verify', '/aceptar-terminos']

const isCurrent = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`)

/**
 * Cabecera única del portal, session-aware (portal de vidrio, decisión 2026-11-13).
 * - En el celu, solo el logo y el botón de tema: la navegación es la barra de abajo.
 * - En la compu, una píldora de vidrio fija arriba con los links al centro y, a la derecha, el
 *   tema y la cuenta. Pasados los 8 px de scroll se condensa una vez (60 → 54 px, más opaca).
 * - Deslogueado: "Ingresar" → /ingresar?next=<página actual> (desde `md`; en el celu lo cubre
 *   la barra de abajo, que lleva al ingreso desde Reservas y Cuenta).
 * - Jugador logueado: chip de avatar + nombre con menú de cuenta (desde `md`; en el celu, Cuenta).
 * - Complejo logueado en una página pública: "Ir a mi panel", también en el celu, porque ahí no
 *   hay barra de abajo.
 * La sesión llega del PortalSessionProvider (hidratación client-side): el HTML server-rendered es
 * siempre el estado anónimo (habilita ISR). `variant="overlay"` flota sobre el hero de la home.
 */
export default function PortalHeader({ variant = 'solid', signOutAction, pushActions }: Props) {
  const { session, staffPanelPath, rivalEnabled } = usePortalSession()
  const pathname = usePathname() ?? ''
  const condensed = useScrolledPast(8)
  // Precedencia: el jugador gana siempre. En la práctica son cookies mutuamente excluyentes (un
  // solo auth user por navegador), pero el orden lo deja determinístico.
  const staffOnly = !session && staffPanelPath !== null
  // En el ingreso mismo (/ingresar, /verify, /aceptar-terminos) "Ingresar" se apuntaría a sí mismo
  // y dejaría ese `next`: después de entrar, el jugador volvería al formulario o al error.
  const onAuthPage = AUTH_PATHS.some((p) => isCurrent(pathname, p))

  const links = [
    { href: '/explorar', label: 'Buscar canchas', show: true },
    { href: '/rival', label: 'Rival', show: rivalEnabled },
    { href: '/mis-reservas', label: 'Mis reservas', show: session !== null && variant === 'solid' },
    { href: '/para-complejos', label: 'Para complejos', show: variant === 'overlay' || !session },
  ].filter((l) => l.show)

  return (
    <header
      data-variant={variant}
      data-condensed={condensed ? '' : undefined}
      className="portal-top"
    >
      <div className="portal-top__bar" data-align={staffOnly ? 'start' : undefined}>
        <span aria-hidden className="portal-top__bg glass" />
        <span aria-hidden className="portal-top__bg portal-top__bg--on" />
        <Link
          href="/"
          aria-label="TurnoGol, inicio"
          className="portal-top__logo inline-flex min-h-11 shrink-0 items-center rounded-full"
        >
          <Logo variant="horizontal" />
        </Link>
        <nav aria-label="Principal" className="portal-top__nav hidden md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isCurrent(pathname, l.href) ? 'page' : undefined}
              className="portal-top__link"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="portal-top__r">
          {/* En el celu flota en vidrio real sobre el hero; en la compu va plano dentro de la píldora. */}
          <ThemeButton className="portal-top__theme glass md:border-transparent md:bg-transparent md:bg-none md:shadow-none md:backdrop-filter-none md:hover:bg-portal-inner" />
          {session ? (
            <div className="hidden md:block">
              <AccountMenu
                firstName={session.firstName}
                lastName={session.lastName}
                email={session.email}
                avatarUrl={session.avatarUrl}
                signOutAction={signOutAction}
                pushActions={pushActions}
              />
            </div>
          ) : staffPanelPath ? (
            <Link href={staffPanelPath} className="portal-top__in">
              Ir a mi panel
            </Link>
          ) : onAuthPage ? null : (
            <IngresarLink className="portal-top__in hidden md:inline-flex">Ingresar</IngresarLink>
          )}
        </div>
      </div>
    </header>
  )
}
