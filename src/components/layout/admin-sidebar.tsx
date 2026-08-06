'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/ui/logo'
import {
  LayoutDashboard,
  CalendarDays,
  Contact,
  Banknote,
  ChartLine,
  Lock,
  Settings,
  Trophy,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StaffRole } from '@/modules/staff/roles'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface SidebarProps {
  tenantName: string
  mobileOpen: boolean
  onClose: () => void
  /** Feature flag 'tournaments' resuelto server-side para este complejo. */
  tournamentsEnabled?: boolean
  /** Rol del staff logueado, leído de la DB server-side. Sin valor (p. ej. stories/tests
   *  sin threadear el prop) se trata como no-admin, igual criterio que `tournamentsEnabled`. */
  staffRole?: StaffRole
}

export interface NavItem {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  /** Solo se muestra si la feature está prendida para el complejo. */
  requiresTournaments?: boolean
  /** Solo se muestra al rol admin (el manager no puede completar estas pantallas). */
  requiresAdmin?: boolean
  /** Ancla para DashboardTour/useCoachmarkTour (`[data-tour-id]`). */
  tourId?: string
  /**
   * Qué pathnames encienden este espacio. Necesario desde Fase 4: un espacio ya
   * no es una ruta sino un conjunto de ellas (Grilla incluye `/reservas`,
   * Clientes incluye `/abonados`), así que el prefijo del href no alcanza.
   */
  match?: (pathname: string) => boolean
}

/**
 * Los 6 espacios del staff (visión v2 §3.2), ordenados por frecuencia real de
 * uso — no por el schema. Configuración vive aparte, al pie: está fuera del
 * flujo diario.
 *
 * Fase 4 fusionó a nivel de navegación: "Reservas" es la pestaña Lista de
 * Grilla y "Turnos fijos" es una pestaña de Clientes. Las URLs no cambiaron —
 * ninguna ruta se movió, sólo dejaron de ser ítems de primer nivel.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Hoy', requiresAdmin: true },
  {
    href: '/grilla',
    icon: CalendarDays,
    label: 'Grilla',
    tourId: 'tour-grilla',
    match: (p) => p === '/grilla' || p === '/reservas' || p.startsWith('/reservas/'),
  },
  { href: '/caja', icon: Banknote, label: 'Caja' },
  {
    href: '/jugadores',
    icon: Contact,
    label: 'Clientes',
    match: (p) => p.startsWith('/jugadores') || p.startsWith('/abonados'),
  },
  { href: '/torneos', icon: Trophy, label: 'Torneos', requiresTournaments: true },
  { href: '/analiticas', icon: ChartLine, label: 'Métricas' },
]

/** Fuera del flujo diario: se separa del resto con un borde, al pie. */
export const CONFIG_ITEM: NavItem = {
  href: '/settings',
  icon: Settings,
  label: 'Configuración',
  requiresAdmin: true,
}

/** Un espacio está activo si su `match` lo dice; si no, por igualdad o prefijo del href. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.match) return item.match(pathname)
  return pathname === item.href || pathname.startsWith(item.href + '/')
}

export function visibleNavItems(opts: {
  tournamentsEnabled?: boolean
  staffRole?: StaffRole
}): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      (!item.requiresTournaments || opts.tournamentsEnabled) &&
      (!item.requiresAdmin || opts.staffRole === 'admin'),
  )
}

function SidebarContent({
  tenantName,
  pathname,
  onClose,
  isMobile,
  tournamentsEnabled,
  staffRole,
}: {
  tenantName: string
  pathname: string
  onClose?: () => void
  isMobile?: boolean
  tournamentsEnabled?: boolean
  staffRole?: StaffRole
}) {
  const navItems = visibleNavItems({ tournamentsEnabled, staffRole })
  const canConfigure = staffRole === 'admin'
  const ConfigIcon = CONFIG_ITEM.icon
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 px-4 py-5 border-b border-border">
        <div className="flex items-center justify-between w-full">
          <Link
            href={staffRole === 'admin' ? '/dashboard' : '/grilla'}
            className="block outline-hidden rounded-sm"
          >
            <Logo variant="horizontal" textClassName="text-foreground" />
          </Link>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground hover:bg-accent"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-muted/40 p-2.5 dark:bg-zinc-950/20">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-emerald-500 to-teal-600 text-white font-bold text-sm shadow-md shadow-emerald-500/10">
            {tenantName.slice(0, 2).toUpperCase()}
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
          </div>
          <div className="min-w-0 flex-1">
            {/* Sin modificador de opacidad: `--muted-foreground` está calibrado a
                4.93:1 (globals.css) y el `/80` lo diluía a 3.93:1, bajo AA. */}
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
              Complejo
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground truncate leading-tight tracking-tight">
              {tenantName}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav aria-label="Navegación del panel" className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navItems.map((item) => {
          const { href, icon: Icon, label, tourId } = item
          const isActive = isNavItemActive(item, pathname)

          return (
            <Link
              key={href}
              href={href}
              data-tour-id={tourId}
              aria-current={isActive ? 'page' : undefined}
              onClick={isMobile ? onClose : undefined}
              className={cn(
                'sidebar-nav-item group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                isActive
                  ? 'bg-emerald-500/10 text-emerald-700 shadow-xs dark:bg-emerald-500/15 dark:text-emerald-400 dark:shadow-emerald-900/30'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {isActive && (
                <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-emerald-500 shadow-sm shadow-emerald-500/40" aria-hidden />
              )}
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0 transition-all duration-200',
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground/70 group-hover:text-foreground group-hover:scale-110',
                )}
              />
              <span className="flex-1 truncate">{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Configuración: fuera del flujo diario, separada y al pie (visión §3.3). */}
      <div className="border-t border-border px-3 py-3">
        {canConfigure ? (
          <Link
            href={CONFIG_ITEM.href}
            aria-current={isNavItemActive(CONFIG_ITEM, pathname) ? 'page' : undefined}
            onClick={isMobile ? onClose : undefined}
            className={cn(
              'sidebar-nav-item group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
              isNavItemActive(CONFIG_ITEM, pathname)
                ? 'bg-emerald-500/10 text-emerald-700 shadow-xs dark:bg-emerald-500/15 dark:text-emerald-400 dark:shadow-emerald-900/30'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {isNavItemActive(CONFIG_ITEM, pathname) && (
              <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-emerald-500 shadow-sm shadow-emerald-500/40" aria-hidden />
            )}
            <ConfigIcon
              className={cn(
                'h-4 w-4 shrink-0 transition-all duration-200',
                isNavItemActive(CONFIG_ITEM, pathname)
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground/70 group-hover:text-foreground group-hover:scale-110',
              )}
            />
            <span className="flex-1 truncate">{CONFIG_ITEM.label}</span>
          </Link>
        ) : (
          // MASTER §6.8: al manager el ítem se le BLOQUEA, no se le esconde — el
          // encargado entiende el sistema completo y sabe a quién pedirle. El
          // candado comunica sin hover (touch); el tooltip agrega el porqué.
          // Es un `button` y no un `span`: el trigger del tooltip tiene que ser
          // focusable, y `disabled` mataría el focus junto con el tooltip.
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-disabled="true"
                onClick={(e) => e.preventDefault()}
                className="sidebar-nav-item group relative flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ConfigIcon className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                <span className="flex-1 truncate">{CONFIG_ITEM.label}</span>
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Solo el dueño</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

export function AdminSidebar({
  tenantName,
  mobileOpen,
  onClose,
  tournamentsEnabled,
  staffRole,
}: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar — rail theme-adaptive (light surface / dark glass) */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-60 flex-col border-r border-border bg-card/95 backdrop-blur-xl shadow-xl shadow-black/4 dark:bg-card/80 dark:shadow-black/30">
        <SidebarContent
          tenantName={tenantName}
          pathname={pathname}
          tournamentsEnabled={tournamentsEnabled}
          staffRole={staffRole}
        />
      </aside>

      {/* Mobile sidebar — Sheet Radix (focus-trap + scroll-lock + Esc; MASTER §6.8).
          lg:hidden en panel y overlay: si queda abierto al pasar a desktop, no tapa nada. */}
      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="left"
          hideClose
          overlayClassName="lg:hidden"
          className="w-60 max-w-[85vw] backdrop-blur-xl shadow-xl shadow-black/10 dark:bg-card/90 dark:shadow-black/40 lg:hidden"
        >
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SidebarContent
            tenantName={tenantName}
            pathname={pathname}
            onClose={onClose}
            isMobile
            tournamentsEnabled={tournamentsEnabled}
            staffRole={staffRole}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
