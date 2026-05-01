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
    <header className="fixed inset-x-0 top-0 z-20 flex h-16 items-center border-b border-slate-200 bg-white px-4 sm:px-6 lg:left-60">
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
        <span className="hidden sm:block text-xs text-slate-500">{userEmail}</span>
        <Button
          variant="ghost"
          className="h-10 gap-2"
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
