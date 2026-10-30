'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { SiteHeaderShell } from './SiteHeaderShell'
import { AccountMenu } from './AccountMenu'
import { IngresarLink } from './IngresarLink'
import { usePortalSession } from './PortalSessionProvider'
import { Search, Building2, Calendar, Swords } from 'lucide-react'

type Props = {
  variant?: 'overlay' | 'solid'
  /** Threaded a AccountMenu — ver el comentario de la prop homónima ahí. */
  signOutAction: () => Promise<void>
}

/**
 * Cabecera única del portal, session-aware. Reemplaza al antiguo `SiteNav`.
 * - Deslogueado: un único CTA "Ingresar" → /ingresar?next=<página actual>.
 * - Jugador logueado: chip de avatar + nombre con menú de cuenta.
 * La sesión llega del PortalSessionProvider (hidratación client-side): el HTML
 * server-rendered es siempre el estado anónimo (habilita ISR) y el chip del
 * jugador aparece tras montar, ocupando el mismo slot derecho de la nav.
 * `variant="overlay"` se usa sobre el hero de la landing (markup preservado).
 */
export default function PortalHeader({ variant = 'solid', signOutAction }: Props) {
  const { session, staffPanelPath, rivalEnabled, rivalWelcomed } = usePortalSession()
  const rivalHref = rivalWelcomed ? '/rival/tablon' : '/rival'

  // Precedencia: el jugador gana siempre. En la práctica son cookies
  // mutuamente excluyentes (un solo auth user por navegador), pero el orden lo
  // deja determinístico. `staffPanelPath` es el acceso del COMPLEJO logueado
  // que llega a una página pública: antes veía "Ingresar" y volvía al login.
  const panelLinkClass =
    'inline-flex h-11 items-center rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground transition-[background-color,scale] hover:bg-accent active:scale-95 sm:px-6 sm:text-sm dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/10 whitespace-nowrap'

  // Un solo header para las dos variantes (la del home): `overlay` flota sobre el hero,
  // `solid` acompaña el scroll. Paddings/gaps mobile-first: a 375px el CTA "Ingresar" no debe
  // desbordar (deuda MASTER §13.5).
  const navLink =
    'hidden min-h-11 items-center gap-1.5 rounded-full px-2.5 py-2 text-xs font-semibold text-muted-foreground transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground sm:px-4 sm:py-[9px] sm:text-sm md:inline-flex'

  return (
    <SiteHeaderShell position={variant === 'overlay' ? 'fixed' : 'sticky'}>
      <Link href="/explorar" className={navLink}>
        <Search className="h-[15px] w-[15px] sm:h-[17px] sm:w-[17px]" aria-hidden />
        Explorar
      </Link>
      {rivalEnabled && (
        <Link href={rivalHref} className={navLink}>
          <Swords className="h-[15px] w-[15px] sm:h-[17px] sm:w-[17px]" aria-hidden />
          Rival
        </Link>
      )}
      {session && variant === 'solid' && (
        <Link href="/mis-reservas" className={cn(navLink, 'sm:inline-flex')}>
          <Calendar className="h-[15px] w-[15px] sm:h-[17px] sm:w-[17px]" aria-hidden />
          Mis reservas
        </Link>
      )}
      {(variant === 'overlay' || !session) && (
        <Link href="/para-complejos" className={cn(navLink, 'sm:inline-flex')}>
          <Building2 className="h-[17px] w-[17px]" aria-hidden />
          Para complejos
        </Link>
      )}
      <span
        aria-hidden
        className="mx-1 hidden h-[22px] w-px bg-border sm:mx-1.5 sm:block dark:bg-white/10"
      />
      {session ? (
        <AccountMenu
          firstName={session.firstName}
          lastName={session.lastName}
          email={session.email}
          avatarUrl={session.avatarUrl}
          variant={variant}
          signOutAction={signOutAction}
        />
      ) : staffPanelPath ? (
        <Link href={staffPanelPath} className={panelLinkClass}>
          Ir a mi panel
        </Link>
      ) : (
        <IngresarLink className={panelLinkClass}>Ingresar</IngresarLink>
      )}
    </SiteHeaderShell>
  )
}
