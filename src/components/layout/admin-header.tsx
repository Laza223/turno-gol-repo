'use client'

import { Menu, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AdminHeaderProps {
  userEmail: string
  onMobileMenuToggle: () => void
  onSignOut: () => void
}

export function AdminHeader({
  userEmail,
  onMobileMenuToggle,
  onSignOut,
}: AdminHeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-20 flex h-[calc(4rem+env(safe-area-inset-top))] items-center border-b border-slate-200 bg-white/95 backdrop-blur-sm shadow-sm shadow-slate-200/50 px-4 sm:px-6 pt-[env(safe-area-inset-top)] lg:left-60">
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onMobileMenuToggle}
        className="lg:hidden mr-2"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side */}
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
          {userEmail}
        </span>
        <Button
          variant="ghost"
          // No explicit h-* — let Button's default size (h-11 md:h-10) keep
          // the 44 px mobile touch target.
          className="gap-2 text-slate-700 hover:text-slate-900"
          onClick={onSignOut}
          aria-label="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
          <span>Salir</span>
        </Button>
      </div>
    </header>
  )
}
