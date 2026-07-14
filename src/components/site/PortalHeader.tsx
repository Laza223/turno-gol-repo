'use client'

import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { AccountMenu } from './AccountMenu'
import { usePortalSession } from './PortalSessionProvider'
import { Search, Building2, Calendar, LogIn } from 'lucide-react'

type Props = {
  variant?: 'overlay' | 'solid'
  /** Threaded a AccountMenu — ver el comentario de la prop homónima ahí. */
  signOutAction: () => Promise<void>
}

/**
 * Cabecera única del portal, session-aware. Reemplaza al antiguo `SiteNav`.
 * - Deslogueado: un único CTA "Ingresar" → /ingresar.
 * - Jugador logueado: chip de avatar + nombre con menú de cuenta.
 * La sesión llega del PortalSessionProvider (hidratación client-side): el HTML
 * server-rendered es siempre el estado anónimo (habilita ISR) y el chip del
 * jugador aparece tras montar, ocupando el mismo slot derecho de la nav.
 * `variant="overlay"` se usa sobre el hero de la landing (markup preservado).
 */
export default function PortalHeader({ variant = 'solid', signOutAction }: Props) {
  const { session } = usePortalSession()

  if (variant === 'overlay') {
    // Pill flotante theme-adaptive (receta .overlay-nav). Paddings/gaps con
    // cascada mobile-first: a 375px el CTA "Ingresar" no debe desbordar
    // (deuda MASTER §13.5).
    return (
      <header className="fixed top-0 z-50 w-full px-3 pt-3.5 sm:px-6 sm:pt-[18px]">
        <div className="mx-auto max-w-[1240px]">
          <div className="overlay-nav flex items-center justify-between gap-2 rounded-full py-2 pl-4 pr-2 sm:gap-6 sm:py-3 sm:pl-6 sm:pr-3.5">
            <Link href="/" aria-label="TurnoGol — inicio" className="shrink-0 transition-opacity hover:opacity-90">
              <Logo variant="horizontal" textClassName="text-foreground" />
            </Link>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Link
                href="/explorar"
                className="inline-flex items-center gap-2 rounded-full px-3 py-[9px] text-sm font-semibold text-muted-foreground transition-all duration-150 hover:bg-foreground/5 hover:text-foreground sm:px-4"
              >
                <Search className="h-[17px] w-[17px]" aria-hidden />
                Explorar
              </Link>
              <Link
                href="/para-complejos"
                className="hidden items-center gap-2 rounded-full px-4 py-[9px] text-sm font-semibold text-muted-foreground transition-all duration-150 hover:bg-foreground/5 hover:text-foreground sm:inline-flex"
              >
                <Building2 className="h-[17px] w-[17px]" aria-hidden />
                Para complejos
              </Link>
              <span aria-hidden className="mx-1 hidden h-[22px] w-px bg-border sm:mx-1.5 sm:block dark:bg-white/10" />
              {session ? (
                <AccountMenu
                  firstName={session.firstName}
                  lastName={session.lastName}
                  email={session.email}
                  avatarUrl={session.avatarUrl}
                  variant="overlay"
                  signOutAction={signOutAction}
                />
              ) : (
                <Link
                  href="/ingresar"
                  className="inline-flex h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95 sm:px-6 dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  Ingresar
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-30 w-full px-4 py-3 bg-transparent">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between rounded-full border border-border bg-card/80 px-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-md sm:px-6 lg:px-8">
        <Link href="/" aria-label="TurnoGol — inicio" className="transition-opacity hover:opacity-90">
          <Logo variant="horizontal" textClassName="text-foreground font-bold" iconClassName="bg-card border-border" />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/explorar"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground md:text-sm"
          >
            <Search className="h-4 w-4" />
            <span>Explorar</span>
          </Link>
          {session ? (
            <>
              <Link
                href="/mis-reservas"
                className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground md:text-sm sm:inline-flex"
              >
                <Calendar className="h-4 w-4" />
                <span>Mis reservas</span>
              </Link>
              <AccountMenu
                firstName={session.firstName}
                lastName={session.lastName}
                email={session.email}
                avatarUrl={session.avatarUrl}
                variant="solid"
                signOutAction={signOutAction}
              />
            </>
          ) : (
            <>
              <Link
                href="/para-complejos"
                className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground md:text-sm sm:inline-flex"
              >
                <Building2 className="h-4 w-4" />
                <span>Para complejos</span>
              </Link>
              <Link
                href="/ingresar"
                className="inline-flex h-11 md:h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:shadow-emerald-500/20 active:scale-95 md:text-sm"
              >
                <LogIn className="h-4 w-4" />
                <span>Ingresar</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
