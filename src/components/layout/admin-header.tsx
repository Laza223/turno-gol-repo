'use client'

import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { AdminThemeMenu } from '@/components/admin/AdminThemeMenu'

interface AdminHeaderProps {
  userEmail: string
  onSignOut: () => void
  /**
   * Destino del logo en mobile (donde el sidebar no se ve): el espacio "casa"
   * del rol — `/dashboard` para el dueño, `/grilla` para el encargado.
   */
  homeHref?: string
}

export function AdminHeader({
  userEmail,
  onSignOut,
  homeHref = '/grilla',
}: AdminHeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-20 flex h-[calc(4rem+env(safe-area-inset-top))] items-center border-b border-border/50 bg-card/80 backdrop-blur-xl shadow-xs shadow-black/3 dark:shadow-black/20 px-4 sm:px-6 pt-[env(safe-area-inset-top)] lg:left-60">
      {/* Gradient accent line — borde inferior emerald sutil */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" aria-hidden />

      {/* Marca en mobile: acá ya no hay hamburguesa (Fase 4 — la navegación
          primaria es la barra inferior), y sin el sidebar a la vista el panel
          se quedaba sin ninguna marca arriba. */}
      <Link href={homeHref} className="lg:hidden rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
        <Logo variant="horizontal" textClassName="text-foreground" />
      </Link>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side */}
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" aria-hidden />
          {userEmail}
        </span>
        <AdminThemeMenu />
        <Button
          variant="ghost"
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
