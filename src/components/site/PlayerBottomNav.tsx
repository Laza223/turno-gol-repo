'use client'

import { Calendar, Compass, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  {
    href: '/explorar',
    label: 'Explorar',
    Icon: Compass,
    match: (p: string) => p === '/' || p.startsWith('/explorar'),
  },
  {
    href: '/mis-reservas',
    label: 'Reservas',
    Icon: Calendar,
    match: (p: string) => p.startsWith('/mis-reservas') || p.startsWith('/reserva'),
  },
  {
    href: '/configuracion',
    label: 'Cuenta',
    Icon: Settings,
    match: (p: string) =>
      p.startsWith('/configuracion') || p.startsWith('/perfil') || p.startsWith('/eliminar-cuenta'),
  },
]

/**
 * Navegación inferior del jugador (mobile-only). Vive en el shell compartido,
 * por lo que aparece tanto en la zona pública como en las secciones del jugador
 * mientras haya sesión. En desktop la navegación es el menú de cuenta (md:hidden).
 */
export function PlayerBottomNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Navegación del jugador"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map(({ href, label, Icon, match }) => {
        const active = match(pathname)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 ${
              active ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden />
            <span className="text-xs font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
