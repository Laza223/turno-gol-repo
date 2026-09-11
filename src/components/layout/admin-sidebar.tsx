'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/ui/logo'
import {
  LayoutDashboard,
  CalendarDays,
  Contact,
  Banknote,
  LandPlot,
  ChartLine,
  Lock,
  LogOut,
  Settings,
  Trophy,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StaffRole } from '@/modules/staff/roles'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface SidebarProps {
  tenantName: string
  mobileOpen: boolean
  onClose: () => void
  /** Email del staff logueado: rotula la cuenta en el riel y en el cajón mobile. */
  userEmail: string
  onSignOut: () => void
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
const NAV_ITEMS: NavItem[] = [
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
  // Canchas salió de Configuración el 2026-09-10, a pedido del dueño: define el
  // inventario y los precios, que es de lo que vive el complejo, y estaba
  // enterrada a dos niveles. Sigue siendo solo del dueño.
  { href: '/canchas', icon: LandPlot, label: 'Canchas', requiresAdmin: true },
  { href: '/torneos', icon: Trophy, label: 'Torneos', requiresTournaments: true },
  { href: '/analiticas', icon: ChartLine, label: 'Métricas' },
]

/**
 * Fuera del flujo diario: se separa del resto empujándolo al pie del riel.
 *
 * Apunta a `/settings/reservas` y no a `/settings`: esa última es un stub cuyo
 * único cuerpo es `redirect('/settings/reservas')`, así que entrar por ahí
 * costaba un render de servidor entero —con su cadena de auth completa— para
 * después mandar al navegador a hacer una segunda navegación. El destino final
 * es el mismo. `/settings` sigue existiendo para links y favoritos viejos.
 */
const CONFIG_ITEM: NavItem = {
  href: '/settings/reservas',
  icon: Settings,
  label: 'Configuración',
  requiresAdmin: true,
  match: (p) => p === '/settings' || p.startsWith('/settings/'),
}

/**
 * En el riel el rótulo dice "Ajustes" y no "Configuración": a 60 px de ancho la
 * palabra larga no entra en una línea, y partirla en dos rompe la altura de fila
 * del resto. El cajón mobile, que tiene ancho, sigue diciendo la palabra
 * completa — es el mismo espacio y el vocabulario de la auditoría lo nombra así.
 */
const CONFIG_RAIL_LABEL = 'Ajustes'

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

/**
 * Fila del riel: ícono arriba, rótulo abajo, 60×52. El rótulo se ve siempre y no
 * vive en un tooltip: el mostrador atiende desde una tablet, donde no hay hover
 * y un ícono solo es una adivinanza.
 */
const RAIL_ITEM =
  'group flex w-[60px] min-h-[52px] shrink-0 flex-col items-center justify-center gap-[3px] rounded-[10px] px-1 text-[10px] font-semibold tracking-[0.01em] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
const NAV_ACTIVE = 'bg-primary/10 text-emerald-800 dark:text-emerald-300'
const NAV_IDLE = 'text-muted-foreground hover:bg-accent hover:text-foreground'

function navIconClass(active: boolean) {
  return cn('h-5 w-5 shrink-0', active && 'text-emerald-700 dark:text-emerald-400')
}

/** Inicial de la cuenta a partir del email, que es lo único que el shell tiene. */
function accountInitial(email: string) {
  return (email.trim()[0] ?? '?').toUpperCase()
}

function AccountMenu({
  userEmail,
  onSignOut,
  className,
}: {
  userEmail: string
  onSignOut: () => void
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cuenta: ${userEmail}`}
          className={cn(
            // 44px (MASTER §10): el mostrador atiende desde una tablet, que
            // entra en el mismo ancho donde vive el riel.
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground ring-1 ring-inset ring-border transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          {accountInitial(userEmail)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="right" sideOffset={8} className="w-64 p-2">
        {/* Sin modificador de opacidad sobre `--muted-foreground`: está calibrado
            a 4.93:1 (globals.css) y cualquier `/N` lo deja bajo AA. */}
        <p className="px-2 pb-2 text-xs font-medium text-muted-foreground break-all">{userEmail}</p>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span>Salir</span>
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Riel de 72 px (escritorio y tablet). Reemplaza a la barra de 240: el nombre del
 * complejo pasó a la barra superior y el total del día se eliminó (ese número es
 * de Caja), así que de la barra vieja sólo quedaba la lista de espacios — y esa
 * entra en 72.
 */
function SidebarRail({
  pathname,
  userEmail,
  onSignOut,
  tournamentsEnabled,
  staffRole,
}: {
  pathname: string
  userEmail: string
  onSignOut: () => void
  tournamentsEnabled?: boolean
  staffRole?: StaffRole
}) {
  const navItems = visibleNavItems({ tournamentsEnabled, staffRole })
  const canConfigure = staffRole === 'admin'
  const ConfigIcon = CONFIG_ITEM.icon
  const configActive = isNavItemActive(CONFIG_ITEM, pathname)

  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[72px] flex-col items-center gap-1 border-r border-border bg-card py-3">
      <Link
        href={staffRole === 'admin' ? '/dashboard' : '/grilla'}
        aria-label="TurnoGol"
        className="mb-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Logo variant="icon" className="text-[15px]" textClassName="text-primary-foreground" />
      </Link>

      <nav
        aria-label="Navegación del panel"
        className="flex w-full flex-col items-center gap-1 overflow-y-auto"
      >
        {navItems.map((item) => {
          const { href, icon: Icon, label, tourId } = item
          const isActive = isNavItemActive(item, pathname)
          return (
            <Link
              key={href}
              href={href}
              data-tour-id={tourId}
              aria-current={isActive ? 'page' : undefined}
              className={cn(RAIL_ITEM, isActive ? NAV_ACTIVE : NAV_IDLE)}
            >
              <Icon className={navIconClass(isActive)} />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="flex-1" />

      {canConfigure ? (
        <Link
          href={CONFIG_ITEM.href}
          aria-label={CONFIG_ITEM.label}
          aria-current={configActive ? 'page' : undefined}
          className={cn(RAIL_ITEM, configActive ? NAV_ACTIVE : NAV_IDLE)}
        >
          <ConfigIcon className={navIconClass(configActive)} />
          <span className="max-w-full truncate">{CONFIG_RAIL_LABEL}</span>
        </Link>
      ) : (
        // MASTER §6.8: al manager el ítem se le BLOQUEA, no se le esconde — el
        // encargado entiende el sistema completo y sabe a quién pedirle. El
        // candado comunica sin hover (touch); el tooltip agrega el porqué, que en
        // el riel no tiene otro lugar donde caber.
        // Es un `button` y no un `span`: el trigger del tooltip tiene que ser
        // focusable, y `disabled` mataría el focus junto con el tooltip.
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-disabled="true"
              aria-label={`${CONFIG_ITEM.label}: solo el dueño`}
              onClick={(e) => e.preventDefault()}
              className={cn(RAIL_ITEM, 'cursor-not-allowed text-muted-foreground/60')}
            >
              <span className="relative">
                <ConfigIcon className="h-5 w-5 shrink-0 text-muted-foreground/50" />
                <Lock
                  className="absolute -right-1.5 -bottom-1 h-3 w-3 text-muted-foreground/70"
                  aria-hidden
                />
              </span>
              <span className="max-w-full truncate">{CONFIG_RAIL_LABEL}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Solo el dueño</TooltipContent>
        </Tooltip>
      )}

      <AccountMenu userEmail={userEmail} onSignOut={onSignOut} className="mt-2" />
    </aside>
  )
}

/**
 * Cajón mobile detrás de "Más" de la barra inferior: acá sí hay ancho, así que
 * los espacios van en lista con el rótulo al lado del ícono y Configuración con
 * su nombre completo.
 */
function SidebarDrawerContent({
  tenantName,
  pathname,
  onClose,
  userEmail,
  onSignOut,
  tournamentsEnabled,
  staffRole,
}: {
  tenantName: string
  pathname: string
  onClose: () => void
  userEmail: string
  onSignOut: () => void
  tournamentsEnabled?: boolean
  staffRole?: StaffRole
}) {
  const navItems = visibleNavItems({ tournamentsEnabled, staffRole })
  const canConfigure = staffRole === 'admin'
  const ConfigIcon = CONFIG_ITEM.icon
  const configActive = isNavItemActive(CONFIG_ITEM, pathname)

  const rowClass =
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
            Complejo
          </p>
          <p className="mt-1 truncate text-sm font-semibold leading-tight tracking-tight text-foreground">
            {tenantName}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <nav
        aria-label="Navegación del panel"
        className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4"
      >
        {navItems.map((item) => {
          const { href, icon: Icon, label } = item
          const isActive = isNavItemActive(item, pathname)
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              onClick={onClose}
              className={cn(rowClass, isActive ? NAV_ACTIVE : NAV_IDLE)}
            >
              <Icon className={navIconClass(isActive)} />
              <span className="flex-1 truncate">{label}</span>
            </Link>
          )
        })}

        {canConfigure ? (
          <Link
            href={CONFIG_ITEM.href}
            aria-current={configActive ? 'page' : undefined}
            onClick={onClose}
            className={cn(rowClass, configActive ? NAV_ACTIVE : NAV_IDLE)}
          >
            <ConfigIcon className={navIconClass(configActive)} />
            <span className="flex-1 truncate">{CONFIG_ITEM.label}</span>
          </Link>
        ) : (
          <div
            aria-disabled="true"
            className={cn(rowClass, 'cursor-not-allowed text-muted-foreground/60')}
          >
            <ConfigIcon className="h-5 w-5 shrink-0 text-muted-foreground/50" />
            <span className="flex-1 truncate">{CONFIG_ITEM.label}</span>
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
            <span className="sr-only">Solo el dueño</span>
          </div>
        )}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <p className="px-3 pb-2 text-xs font-medium text-muted-foreground break-all">{userEmail}</p>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span>Salir</span>
        </Button>
      </div>
    </div>
  )
}

export function AdminSidebar({
  tenantName,
  mobileOpen,
  onClose,
  userEmail,
  onSignOut,
  tournamentsEnabled,
  staffRole,
}: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      <SidebarRail
        pathname={pathname}
        userEmail={userEmail}
        onSignOut={onSignOut}
        tournamentsEnabled={tournamentsEnabled}
        staffRole={staffRole}
      />

      {/* Cajón mobile — Sheet Radix (focus-trap + scroll-lock + Esc; MASTER §6.8).
          lg:hidden en panel y overlay: si queda abierto al pasar a desktop, no tapa nada. */}
      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="left"
          hideClose
          overlayClassName="lg:hidden"
          className="w-60 max-w-[85vw] backdrop-blur-xl shadow-xl shadow-black/10 dark:bg-card/90 dark:shadow-black/40 lg:hidden"
        >
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SidebarDrawerContent
            tenantName={tenantName}
            pathname={pathname}
            onClose={onClose}
            userEmail={userEmail}
            onSignOut={onSignOut}
            tournamentsEnabled={tournamentsEnabled}
            staffRole={staffRole}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
