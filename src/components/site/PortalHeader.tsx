'use client'

import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { AccountMenu } from './AccountMenu'
import { usePortalSession } from './PortalSessionProvider'
import { Search, Building2, Calendar, LogIn } from 'lucide-react'

type Props = { variant?: 'overlay' | 'solid' }

/**
 * Cabecera única del portal, session-aware. Reemplaza al antiguo `SiteNav`.
 * - Deslogueado: un único CTA "Ingresar" → /ingresar.
 * - Jugador logueado: chip de avatar + nombre con menú de cuenta.
 * La sesión llega del PortalSessionProvider (hidratación client-side): el HTML
 * server-rendered es siempre el estado anónimo (habilita ISR) y el chip del
 * jugador aparece tras montar, ocupando el mismo slot derecho de la nav.
 * `variant="overlay"` se usa sobre el hero de la landing (markup preservado).
 */
export default function PortalHeader({ variant = 'solid' }: Props) {
  const { session } = usePortalSession()

  if (variant === 'overlay') {
    return (
      <header className="absolute inset-x-0 top-0 z-30 w-full px-4 py-4 md:px-6">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between rounded-full border border-white/10 bg-slate-950/20 px-4 shadow-[0_8px_30px_rgb(0,0,0,0.15)] backdrop-blur-md sm:px-6 lg:px-8">
          <Link href="/" aria-label="TurnoGol — inicio" className="transition-opacity hover:opacity-90">
            <Logo
              variant="horizontal"
              textClassName="text-white font-bold"
              iconClassName="bg-white/95 border-emerald-500 shadow-emerald-500/30"
            />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/explorar"
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-200 transition-all duration-200 hover:bg-white/10 hover:text-white md:text-sm"
            >
              <Search className="h-4 w-4" />
              <span>Explorar</span>
            </Link>
            <Link
              href="/para-complejos"
              className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-200 transition-all duration-200 hover:bg-white/10 hover:text-white md:text-sm sm:inline-flex"
            >
              <Building2 className="h-4 w-4" />
              <span>Para complejos</span>
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            {session ? (
              <AccountMenu
                firstName={session.firstName}
                lastName={session.lastName}
                email={session.email}
                avatarUrl={session.avatarUrl}
                variant="overlay"
              />
            ) : (
              <Link
                href="/ingresar"
                className="inline-flex h-9 items-center rounded-full bg-white px-4 text-xs font-semibold text-slate-900 shadow-md transition-all duration-200 hover:bg-slate-100 active:scale-95 md:text-sm"
              >
                Ingresar
              </Link>
            )}
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-30 w-full px-4 py-3 bg-transparent">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between rounded-full border border-slate-200/80 bg-white/80 px-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-md sm:px-6 lg:px-8">
        <Link href="/" aria-label="TurnoGol — inicio" className="transition-opacity hover:opacity-90">
          <Logo variant="horizontal" textClassName="text-slate-900 font-bold" iconClassName="bg-white border-slate-200" />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/explorar"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 md:text-sm"
          >
            <Search className="h-4 w-4" />
            <span>Explorar</span>
          </Link>
          {session ? (
            <>
              <Link
                href="/mis-reservas"
                className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 md:text-sm sm:inline-flex"
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
              />
            </>
          ) : (
            <>
              <Link
                href="/para-complejos"
                className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 md:text-sm sm:inline-flex"
              >
                <Building2 className="h-4 w-4" />
                <span>Para complejos</span>
              </Link>
              <Link
                href="/ingresar"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-emerald-700 hover:shadow-md hover:shadow-emerald-500/20 active:scale-95 md:text-sm"
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
