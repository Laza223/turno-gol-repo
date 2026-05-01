'use client'

import { Menu, LogOut } from 'lucide-react'

interface AdminHeaderProps {
  userEmail: string
  mobileMenuOpen: boolean
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
      <button
        type="button"
        onClick={onMobileMenuToggle}
        className="lg:hidden p-2 rounded-md text-slate-500 hover:bg-slate-100 transition-colors duration-150 mr-2"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side */}
      <div className="flex items-center gap-3">
        <span className="hidden sm:block text-xs text-slate-500">{userEmail}</span>
        <button
          type="button"
          onClick={onSignOut}
          className="flex items-center gap-1.5 h-10 px-4 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors duration-150"
          aria-label="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
          <span>Salir</span>
        </button>
      </div>
    </header>
  )
}
