'use client'

import { ViewTransition, useEffect, useState, type CSSProperties } from 'react'
import { Calendar, Compass, Swords, UserRound } from 'lucide-react'
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
    Icon: UserRound,
    // El ingreso del jugador también es Cuenta (`ingresar.html`): sin sesión, Cuenta lleva ahí.
    match: (p: string) =>
      p.startsWith('/configuracion') ||
      p.startsWith('/perfil') ||
      p.startsWith('/eliminar-cuenta') ||
      p.startsWith('/ingresar') ||
      p.startsWith('/aceptar-terminos') ||
      p.startsWith('/verify'),
  },
]

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

/**
 * La pestaña activa de la última vez que se dibujó la barra. Vive en el módulo y no en un estado:
 * la barra se vuelve a montar al cambiar de grupo de rutas (la home, `(public)`, `(player)`), y el
 * toque del ícono va solo cuando la pestaña CAMBIÓ, nunca al cargar o recargar una página.
 */
let lastActiveHref: string | null = null

/**
 * La barra se compacta al bajar y vuelve al subir (dirección §5.11). Pasados 120 px, cada tramo de
 * más de 8 px decide: bajando se compacta, subiendo vuelve. El estado solo cambia al cambiar de
 * sentido, así que no hay un render por cuadro.
 */
function useCompactOnScroll(): boolean {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (Math.abs(y - last) < 8) return
      setCompact(y > last && y > 120)
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return compact
}

/**
 * Navegación inferior del jugador (solo en el celu): la píldora flotante del portal de vidrio
 * (decisión 2026-11-13). Vive en el shell compartido, así que aparece en la zona pública y en las
 * secciones del jugador, CON o SIN sesión: sin sesión, Reservas y Cuenta redirigen a
 * /ingresar?next=… por el guard de cada página. En la compu la navegación es la cabecera.
 *
 * - La pestaña activa la marca UNA píldora (`[data-tabbar-pill]`) que se traslada de una a otra
 *   con el resorte `píldora`. Entre pantallas la lleva la transición de vista `portal-tabbar-pill`
 *   (la barra se vuelve a montar, así que una transición de CSS no alcanzaría). Además del color,
 *   la activa va en semibold: el estado no se dice solo con color.
 * - El ícono de la pestaña nueva hace su toque (0,86 → 1).
 * - Baja y sale cuando sube una hoja o hay un campo con foco (globals.css, `.portal-tabbar`).
 * - Se compacta al bajar (`data-compact`): se achica y esconde los nombres. Vuelve al subir.
 *
 * Ocupa 12 px de aire + 66 px + el área segura: `--portal-tabbar-space`, que reservan
 * `PortalFrame`, la home, `ConfirmBookingButton` y el scroll-padding de `globals.css`.
 */
export function PlayerBottomNav() {
  const pathname = usePathname()
  const visible = useBottomNavVisible()
  const { rivalEnabled } = usePortalSession()
  // Con RIVAL prendido, Rival va segundo: Explorar · Rival · Reservas · Cuenta.
  const items = rivalEnabled ? [NAV_ITEMS[0]!, RIVAL_ITEM, ...NAV_ITEMS.slice(1)] : NAV_ITEMS
  const activeIndex = items.findIndex((item) => item.match(pathname))
  const activeHref = items[activeIndex]?.href ?? null
  const justActivated = lastActiveHref !== null && activeHref !== lastActiveHref
  const compact = useCompactOnScroll()

  useEffect(() => {
    lastActiveHref = activeHref
  }, [activeHref])

  if (!visible) return null
  return (
    <nav
      aria-label="Navegación del jugador"
      data-bottom-nav
      data-compact={compact ? '' : undefined}
      className="portal-tabbar md:hidden"
      style={{ '--n': items.length } as CSSProperties}
    >
      {activeIndex >= 0 && (
        <ViewTransition
          name="portal-tabbar-pill"
          share="portal-pill"
          update="portal-pill"
          default="none"
        >
          <span
            aria-hidden
            data-tabbar-pill
            className="portal-tabbar__pill"
            style={{ '--i': activeIndex } as CSSProperties}
          />
        </ViewTransition>
      )}
      {items.map(({ href, label, Icon }, i) => {
        const active = i === activeIndex
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            data-just-activated={active && justActivated ? '' : undefined}
            className="portal-tabbar__item"
          >
            <Icon aria-hidden />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
