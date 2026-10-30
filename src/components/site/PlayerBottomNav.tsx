'use client'

import { Calendar, Compass, Settings, Swords } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePortalSession } from './PortalSessionProvider'

const RIVAL_ITEM = {
  href: '/rival',
  label: 'Rival',
  Icon: Swords,
  match: (p: string) => p === '/rival' || p.startsWith('/rival/'),
}

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
 * por lo que aparece en la zona pública y en las secciones del jugador, CON o SIN
 * sesión: sin sesión, Reservas y Cuenta redirigen a /ingresar?next=… por el guard de
 * cada página. En desktop la navegación es el menú de cuenta (md:hidden).
 * Alto real: 56 px de ítems (`min-h-14`) + 1 px de borde + área segura. Lo reservan
 * `PortalFrame`, `globals.css` (scroll-padding) y `ConfirmBookingButton`: si cambia, cambian.
 */
/** Páginas del portal que no son del jugador: la cuenta del complejo suspendido o por reactivar. */
const NO_NAV_PATHS = ['/suspended', '/reactivar']

/**
 * La barra va con o sin sesión de jugador, pero no en `/suspended` ni `/reactivar` ni cuando hay
 * sesión de complejo (`staffPanelPath`, la misma señal que usa `PortalHeader`): ahí Reservas y
 * Cuenta no son del visitante.
 */
export function useBottomNavVisible(): boolean {
  const pathname = usePathname()
  const { staffPanelPath } = usePortalSession()
  if (staffPanelPath) return false
  return !NO_NAV_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function PlayerBottomNav() {
  const pathname = usePathname()
  const visible = useBottomNavVisible()
  const { rivalEnabled, rivalWelcomed } = usePortalSession()
  if (!visible) return null
  // Con RIVAL prendido, Rival va segundo: Explorar · Rival · Reservas · Cuenta.
  // Quien ya aceptó la bienvenida entra directo al tablón; el resto, a la landing.
  const rivalItem = { ...RIVAL_ITEM, href: rivalWelcomed ? '/rival/tablon' : RIVAL_ITEM.href }
  const items = rivalEnabled ? [NAV_ITEMS[0]!, rivalItem, ...NAV_ITEMS.slice(1)] : NAV_ITEMS
  return (
    <nav
      aria-label="Navegación del jugador"
      data-bottom-nav
      // z-40 y no z-10: con el PortalHeader en z-50, cualquier elevación
      // intermedia se le montaba encima a la nav. Queda igual por debajo del
      // overlay de Dialog/Sheet, que es lo que se busca.
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map(({ href, label, Icon, match }) => {
        const active = match(pathname)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
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
