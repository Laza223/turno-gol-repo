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
 * Plana, con el mismo fondo que la barra superior (card en claro, background en oscuro).
 * El ítem activo no se dice solo con color: verde, semibold y una marca `primary` de
 * 2 px arriba del ícono (aria-current ya lo anuncia a los lectores de pantalla).
 */
export function PlayerBottomNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Navegación del jugador"
      // z-40 y no z-10: con el PortalHeader en z-50, cualquier elevación
      // intermedia se le montaba encima a la nav. Queda igual por debajo del
      // overlay de Dialog/Sheet, que es lo que se busca.
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden dark:bg-background"
    >
      {NAV_ITEMS.map(({ href, label, Icon, match }) => {
        const active = match(pathname)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
              active
                ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                : 'font-medium text-muted-foreground hover:text-foreground'
            }`}
          >
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 mx-auto h-0.5 w-10 rounded-full bg-primary"
              />
            )}
            <Icon className="h-5 w-5" aria-hidden />
            <span className="whitespace-nowrap text-[13px]">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
