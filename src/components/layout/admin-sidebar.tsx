'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/ui/logo'
import {
  LayoutDashboard,
  CalendarDays,
  CalendarCheck,
  Users,
  Trophy,
  Banknote,
  BarChart3,
  ChartLine,
  UserCog,
  Settings,
  Lock,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface SidebarProps {
  tenantName: string
  mobileOpen: boolean
  onClose: () => void
}

interface NavItem {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  pin?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
  { href: '/grilla', icon: CalendarDays, label: 'Grilla' },
  { href: '/reservas', icon: CalendarCheck, label: 'Reservas' },
  { href: '/abonados', icon: Users, label: 'Abonados' },
  { href: '/canchas', icon: Trophy, label: 'Canchas', pin: true },
  { href: '/caja', icon: Banknote, label: 'Caja' },
  { href: '/reportes', icon: BarChart3, label: 'Reportes', pin: true },
  { href: '/metricas', icon: ChartLine, label: 'Métricas', pin: true },
  { href: '/staff', icon: UserCog, label: 'Equipo', pin: true },
  { href: '/settings', icon: Settings, label: 'Configuración', pin: true },
]

function SidebarContent({
  tenantName,
  pathname,
  onClose,
  isMobile,
}: {
  tenantName: string
  pathname: string
  onClose?: () => void
  isMobile?: boolean
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-slate-700/60">
        <div className="min-w-0">
          <Link href="/dashboard" className="block outline-none rounded-sm">
            <Logo variant="horizontal" textClassName="text-white" iconClassName="bg-white/95" />
          </Link>
          <div className="mt-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Complejo
            </p>
            <p className="text-sm font-medium text-slate-200 truncate">{tenantName}</p>
          </div>
        </div>
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="ml-2 text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Nav */}
      <nav aria-label="Navegación del panel" className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, icon: Icon, label, pin }) => {
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
                  ? 'bg-emerald-600/20 text-emerald-400 shadow-sm shadow-emerald-900/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
              )}
            >
              {isActive && (
                <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-emerald-500" aria-hidden />
              )}
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0 transition-colors',
                  isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300',
                )}
              />
              <span className="flex-1 truncate">{label}</span>
              {pin && (
                <Lock
                  className="h-3.5 w-3.5 shrink-0 text-slate-600"
                  aria-hidden="true"
                />
              )}
              {pin && <span className="sr-only">Requiere PIN</span>}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export function AdminSidebar({ tenantName, mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar — dark shell */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-60 flex-col border-r border-slate-700/60 bg-slate-900 shadow-xl shadow-black/20">
        <SidebarContent tenantName={tenantName} pathname={pathname} />
      </aside>

      {/* Mobile sidebar — dark shell */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-60 flex flex-col border-r border-slate-700/60 bg-slate-900 shadow-xl shadow-black/30 transition-transform duration-200 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-hidden={!mobileOpen}
      >
        <SidebarContent
          tenantName={tenantName}
          pathname={pathname}
          onClose={onClose}
          isMobile
        />
      </div>
    </>
  )
}
