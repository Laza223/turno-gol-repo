'use client'

import { useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { StaffRole } from '@/modules/staff/roles'
import { AdminSidebar } from './admin-sidebar'
import { AdminHeader } from './admin-header'
import { StatusBanner } from './status-banner'

interface AdminLayoutShellProps {
  children: ReactNode
  tenantName: string
  tenantStatus: string
  trialEndsAt: string | null
  periodEnd: string | null
  userEmail: string
  signOut: () => Promise<never>
  /** Banner rojo de impersonación (solo en sesiones del super admin). */
  impersonationBanner?: ReactNode
  /** Feature flag 'tournaments' resuelto server-side para este complejo. */
  tournamentsEnabled?: boolean
  /** Rol del staff logueado, leído de la DB server-side. Sin valor se trata como
   *  no-admin en el sidebar (mismo criterio que `tournamentsEnabled`). */
  staffRole?: StaffRole
}

export function AdminLayoutShell({
  children,
  tenantName,
  tenantStatus,
  trialEndsAt,
  periodEnd,
  userEmail,
  signOut,
  impersonationBanner,
  tournamentsEnabled,
  staffRole,
}: AdminLayoutShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [, startTransition] = useTransition()
  const pathname = usePathname()
  const isGrilla = pathname === '/grilla'

  function handleSignOut() {
    startTransition(async () => {
      await signOut()
    })
  }

  return (
    // dvh y no vh: en iOS `100vh` incluye la barra de URL, así que el contenedor
    // queda más alto que el área visible — y con `overflow-hidden` el excedente
    // es INALCANZABLE (los últimos turnos de la grilla no se podían tocar).
    <div className={cn("min-h-dvh shell-bg", isGrilla && "h-dvh overflow-hidden flex flex-col")}>
      {/* Sidebar (el overlay mobile lo trae el Sheet de AdminSidebar) */}
      <AdminSidebar
        tenantName={tenantName}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        tournamentsEnabled={tournamentsEnabled}
        staffRole={staffRole}
      />

      {/* Header */}
      <AdminHeader
        userEmail={userEmail}
        onMobileMenuToggle={() => setMobileOpen((prev) => !prev)}
        onSignOut={handleSignOut}
      />

      {/* Main content */}
      <div className={cn("lg:pl-60", isGrilla && "h-dvh flex flex-col min-h-0 overflow-hidden")}>
        <div className={cn("pt-[calc(4rem+env(safe-area-inset-top))]", isGrilla && "flex-1 flex flex-col min-h-0 overflow-hidden")}>
          {/* Banner de impersonación (super admin): pegado bajo el header */}
          {impersonationBanner}

          {/* Status banner */}
          <StatusBanner
            tenantStatus={tenantStatus}
            trialEndsAt={trialEndsAt}
            periodEnd={periodEnd}
          />

          {/* Page content — slate gradient suave sobre el shell oscuro */}
          <main
            id="main-content"
            className={cn(
              "content-area-gradient mx-auto w-full px-4 sm:px-6 lg:px-8",
              isGrilla
                ? "max-w-full flex-1 flex flex-col min-h-0 overflow-hidden py-4"
                : "max-w-7xl py-8 min-h-[calc(100dvh-4rem)]"
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
