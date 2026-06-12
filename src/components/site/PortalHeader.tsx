'use client'

import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { AccountMenu } from './AccountMenu'
import { usePortalSession } from './PortalSessionProvider'

type Props = { variant?: 'overlay' | 'solid' }

/**
 * Cabecera única del portal, session-aware. Reemplaza al antiguo `SiteNav`.
 * - Deslogueado: "Iniciar sesión" / "Comenzar" (igual que antes).
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
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="TurnoGol — inicio">
            <Logo
              variant="horizontal"
              textClassName="text-white"
              iconClassName="bg-white/95 border-emerald-500 shadow-emerald-500/30"
            />
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <Link href="/explorar" className="text-sm text-slate-300 transition-colors hover:text-white">
              Explorar
            </Link>
            <Link href="/para-complejos" className="text-sm text-slate-300 transition-colors hover:text-white">
              Para complejos
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
              <>
                <Link
                  href="/login"
                  className="hidden text-sm font-medium text-slate-200 transition-colors hover:text-white sm:inline"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/register"
                  className="inline-flex h-9 items-center rounded-md bg-white px-4 text-sm font-semibold text-slate-900 shadow-lg shadow-slate-900/30 transition-colors duration-150 hover:bg-slate-100"
                >
                  Comenzar
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="TurnoGol — inicio">
          <Logo variant="horizontal" textClassName="text-slate-900" iconClassName="bg-white border-slate-200" />
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/explorar" className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">
            Explorar
          </Link>
          {session ? (
            <>
              <Link
                href="/mis-reservas"
                className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 sm:inline"
              >
                Mis reservas
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
                className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 sm:inline"
              >
                Para complejos
              </Link>
              <Link
                href="/login"
                className="inline-flex h-9 items-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
              >
                Ingresar
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
