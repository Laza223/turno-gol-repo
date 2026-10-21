'use client'

import { useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  Building2,
  LogOut,
  Menu,
  MessageCircle,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TONE_BADGE } from '@/lib/status-tone'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { AdminThemeMenu } from '@/components/admin/AdminThemeMenu'

/**
 * Shell del panel SuperAdmin — calcado estructural de `admin-layout-shell`
 * (sidebar fija lg+, drawer mobile, header fijo). La identidad es la misma
 * esmeralda del resto del producto (DESIGN.md); lo que marca el sombrero es el
 * identificador "SuperAdmin" del header y del sidebar.
 */

interface SuperAdminLayoutShellProps {
  children: ReactNode
  userEmail: string
  adminName: string
  signOut: () => Promise<never>
}

interface NavItem {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/super-admin', icon: Activity, label: 'Pulso' },
  { href: '/super-admin/tenants', icon: Building2, label: 'Complejos' },
  { href: '/super-admin/jugadores', icon: Users, label: 'Jugadores' },
  { href: '/super-admin/whatsapp', icon: MessageCircle, label: 'Bot de WhatsApp' },
]

function SidebarContent({
  adminName,
  pathname,
  onClose,
  isMobile,
}: {
  adminName: string
  pathname: string
  onClose?: () => void
  isMobile?: boolean
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-border">
        <div className="min-w-0">
          <Link href="/super-admin" className="block outline-hidden rounded-sm">
            <Logo variant="horizontal" textClassName="text-foreground" />
          </Link>
          <div className="mt-1">
            <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              TurnoGol — SuperAdmin
            </p>
            <p className="text-sm font-medium text-foreground truncate">{adminName}</p>
          </div>
        </div>
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="ml-2 text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Nav */}
      <nav
        aria-label="Navegación del panel super-admin"
        className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5"
      >
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href || (href !== '/super-admin' && pathname.startsWith(href + '/'))

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              onClick={isMobile ? onClose : undefined}
              className={cn(
                'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary/10 text-emerald-800 dark:text-emerald-300'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0 transition-colors',
                  isActive
                    ? 'text-emerald-700 dark:text-emerald-400'
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

export function SuperAdminLayoutShell({
  children,
  userEmail,
  adminName,
  signOut,
}: SuperAdminLayoutShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [, startTransition] = useTransition()
  const pathname = usePathname()

  function handleSignOut() {
    startTransition(async () => {
      await signOut()
    })
  }

  return (
    <div className="min-h-dvh shell-bg">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-25 bg-black/50 lg:hidden cursor-pointer"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar desktop */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-60 flex-col border-r border-border bg-card/95 backdrop-blur-xl shadow-xl shadow-black/4 dark:bg-card/80 dark:shadow-black/30">
        <SidebarContent adminName={adminName} pathname={pathname} />
      </aside>

      {/* Sidebar mobile */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-60 flex flex-col border-r border-border bg-card backdrop-blur-xl shadow-xl shadow-black/10 dark:bg-card/90 dark:shadow-black/40 transition-transform duration-200 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-hidden={!mobileOpen}
      >
        <SidebarContent
          adminName={adminName}
          pathname={pathname}
          onClose={() => setMobileOpen(false)}
          isMobile
        />
      </div>

      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-[calc(4rem+env(safe-area-inset-top))] items-center border-b border-border bg-card/80 backdrop-blur-xl shadow-xs shadow-black/3 dark:shadow-black/20 px-4 sm:px-6 pt-[env(safe-area-inset-top)] lg:left-60">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="lg:hidden mr-2"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Identificador de modo — visible también en mobile */}
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
            TONE_BADGE.brand,
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          SuperAdmin
        </span>

        <div className="flex-1" />

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden sm:inline-flex items-center rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            {userEmail}
          </span>
          <AdminThemeMenu />
          <Button
            variant="ghost"
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={handleSignOut}
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
            <span>Salir</span>
          </Button>
        </div>
      </header>

      {/* Main content */}
      {/* El fondo va acá, sin tope de ancho: en el `<main>` el tope dibuja una caja
          con franjas de otro tono a los costados (mismo criterio que AdminLayoutShell). */}
      <div className="content-area-gradient lg:pl-60">
        <div className="pt-[calc(4rem+env(safe-area-inset-top))]">
          <main
            id="main-content"
            className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8 min-h-[calc(100dvh-4rem)]"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
