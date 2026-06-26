'use client'

import { Menu, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AdminThemeMenu } from '@/components/admin/AdminThemeMenu'

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
    <header className="fixed inset-x-0 top-0 z-20 flex h-[calc(4rem+env(safe-area-inset-top))] items-center border-b border-border bg-card/80 backdrop-blur-xl shadow-sm shadow-black/[0.03] dark:shadow-black/20 px-4 sm:px-6 pt-[env(safe-area-inset-top)] lg:left-60">
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
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="hidden sm:inline-flex items-center rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
          {userEmail}
        </span>
        <AdminThemeMenu />
        <Button
          variant="ghost"
          // No explicit h-* — let Button's default size (h-11 md:h-10) keep
          // the 44 px mobile touch target.
          className="gap-2 text-muted-foreground hover:text-foreground"
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
