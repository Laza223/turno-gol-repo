'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StaffRole } from '@/modules/staff/roles'
import { isNavItemActive, visibleNavItems } from './admin-sidebar'

/**
 * Navegación inferior del staff en mobile (visión v2 §3.3): "el pulgar llega a
 * todo (Fitts); nada de hamburguesa como acceso primario".
 *
 * Los tres accesos directos son los TRES PRIMEROS espacios visibles para el rol
 * — y como `NAV_ITEMS` ya está ordenado por frecuencia real de uso, eso da
 * `Hoy · Grilla · Caja` para el dueño y `Grilla · Caja · Clientes` para el
 * encargado (que no tiene Hoy, por D5) sin ninguna lista aparte que mantener.
 * El cuarto lugar es "Más", que abre el drawer con los 6 espacios completos.
 *
 * `lg:hidden` como el sidebar es `hidden lg:flex`: nunca están los dos en el
 * árbol de accesibilidad al mismo tiempo, así que comparten `aria-label`.
 */
export function AdminBottomNav({
  onOpenMore,
  moreOpen,
  tournamentsEnabled,
  staffRole,
}: {
  onOpenMore: () => void
  moreOpen: boolean
  tournamentsEnabled?: boolean
  staffRole?: StaffRole
}) {
  const pathname = usePathname()
  const primary = visibleNavItems({ tournamentsEnabled, staffRole }).slice(0, 3)

  const itemClass =
    'flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2.5 min-h-14 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

  return (
    <nav
      aria-label="Navegación del panel"
      // z-40: por debajo del overlay de Dialog/Sheet (que es lo que se busca) y
      // por encima de cualquier elevación de contenido. Mismo criterio que
      // PlayerBottomNav.
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {primary.map((item) => {
        const Icon = item.icon
        const active = isNavItemActive(item, pathname)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              itemClass,
              active
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}

      <button
        type="button"
        onClick={onOpenMore}
        aria-expanded={moreOpen}
        aria-haspopup="dialog"
        className={cn(itemClass, 'text-muted-foreground hover:text-foreground')}
      >
        <MoreHorizontal className="h-5 w-5 shrink-0" aria-hidden />
        <span className="truncate">Más</span>
      </button>
    </nav>
  )
}
