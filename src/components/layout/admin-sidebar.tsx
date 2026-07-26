'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/ui/logo'
import {
  LayoutDashboard,
  CalendarDays,
  CalendarCheck,
  Users,
  Contact,
  Banknote,
  ChartLine,
  Settings,
  Trophy,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

interface SidebarProps {
  tenantName: string
  mobileOpen: boolean
  onClose: () => void
  /** Feature flag 'tournaments' resuelto server-side para este complejo. */
  tournamentsEnabled?: boolean
}

interface NavItem {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  /** Solo se muestra si la feature está prendida para el complejo. */
  requiresTournaments?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
  { href: '/grilla', icon: CalendarDays, label: 'Grilla' },
  { href: '/reservas', icon: CalendarCheck, label: 'Reservas' },
  { href: '/abonados', icon: Users, label: 'Turnos fijos' },
  { href: '/torneos', icon: Trophy, label: 'Torneos', requiresTournaments: true },
  { href: '/jugadores', icon: Contact, label: 'Jugadores' },
  { href: '/caja', icon: Banknote, label: 'Caja y Cantina' },
  { href: '/analiticas', icon: ChartLine, label: 'Analíticas' },
  { href: '/settings', icon: Settings, label: 'Configuración' },
]

function SidebarContent({
  tenantName,
  pathname,
  onClose,
  isMobile,
  tournamentsEnabled,
}: {
  tenantName: string
  pathname: string
  onClose?: () => void
  isMobile?: boolean
  tournamentsEnabled?: boolean
}) {
  const navItems = NAV_ITEMS.filter(
    (item) => !item.requiresTournaments || tournamentsEnabled,
  )
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 px-4 py-5 border-b border-border">
        <div className="flex items-center justify-between w-full">
          <Link href="/dashboard" className="block outline-hidden rounded-sm">
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
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 leading-none">
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
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href ||
            (href !== '/dashboard' && pathname.startsWith(href + '/'))

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              onClick={isMobile ? onClose : undefined}
              className={cn(
                'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-emerald-500/10 text-emerald-700 shadow-xs dark:bg-emerald-500/15 dark:text-emerald-400 dark:shadow-emerald-900/30'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {isActive && (
                <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-emerald-500" aria-hidden />
              )}
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0 transition-colors',
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground/70 group-hover:text-foreground',
                )}
              />
              <span className="flex-1 truncate">{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export function AdminSidebar({
  tenantName,
  mobileOpen,
  onClose,
  tournamentsEnabled,
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
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
