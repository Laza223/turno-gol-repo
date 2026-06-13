'use client'

import { useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, LayoutDashboard, LogOut, Menu, ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'

/**
 * Shell del panel SuperAdmin — calcado estructural de `admin-layout-shell`
 * (sidebar fija lg+, drawer mobile, header fijo) pero con piel propia:
 * sidebar slate-900 con acento violeta (violet-600) para que siempre sea
 * obvio en qué sombrero estás (spec 2026-06-12 §4).
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
  { href: '/super-admin', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/super-admin/tenants', icon: Building2, label: 'Tenants' },
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
      <div className="flex items-center justify-between px-4 py-5 border-b border-violet-900/60">
        <div className="min-w-0">
          <Link href="/super-admin" className="block outline-none rounded-sm">
            <Logo variant="horizontal" textClassName="text-white" iconClassName="bg-white/95" />
          </Link>
          <div className="mt-1">
            <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-violet-400">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              TurnoGol — SuperAdmin
            </p>
            <p className="text-sm font-medium text-slate-200 truncate">{adminName}</p>
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
      <nav aria-label="Navegación del panel super-admin" className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive =
            pathname === href ||
            (href !== '/super-admin' && pathname.startsWith(href + '/'))

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              onClick={isMobile ? onClose : undefined}
              className={cn(
                'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-violet-600/20 text-violet-300 shadow-sm shadow-violet-950/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
              )}
            >
              {isActive && (
                <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-violet-500" aria-hidden />
              )}
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0 transition-colors',
                  isActive ? 'text-violet-400' : 'text-slate-500 group-hover:text-slate-300',
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
    <div className="min-h-screen bg-slate-900">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[25] bg-black/50 lg:hidden cursor-pointer"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar desktop — dark shell con acento violeta */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-60 flex-col border-r border-violet-900/60 bg-slate-900 shadow-xl shadow-black/20">
        <SidebarContent adminName={adminName} pathname={pathname} />
      </aside>

      {/* Sidebar mobile */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-60 flex flex-col border-r border-violet-900/60 bg-slate-900 shadow-xl shadow-black/30 transition-transform duration-200 lg:hidden',
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
      <header className="fixed inset-x-0 top-0 z-20 flex h-[calc(4rem+env(safe-area-inset-top))] items-center border-b border-slate-200 bg-white/95 backdrop-blur-sm shadow-sm shadow-slate-200/50 px-4 sm:px-6 pt-[env(safe-area-inset-top)] lg:left-60">
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
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          SuperAdmin
        </span>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            {userEmail}
          </span>
          <Button
            variant="ghost"
            className="gap-2 text-slate-700 hover:text-slate-900"
            onClick={handleSignOut}
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
            <span>Salir</span>
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="lg:pl-60">
        <div className="pt-[calc(4rem+env(safe-area-inset-top))]">
          <main
            id="main-content"
            className="bg-slate-50 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 min-h-[calc(100vh-4rem)]"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
