'use client'

import { useState, useTransition } from 'react'
import type { ReactNode } from 'react'
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
}

export function AdminLayoutShell({
  children,
  tenantName,
  tenantStatus,
  trialEndsAt,
  periodEnd,
  userEmail,
  signOut,
}: AdminLayoutShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [, startTransition] = useTransition()

  function handleSignOut() {
    startTransition(async () => {
      await signOut()
    })
  }

  return (
    <div className="min-h-screen shell-bg">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[25] bg-black/50 lg:hidden cursor-pointer"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <AdminSidebar
        tenantName={tenantName}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      {/* Header */}
      <AdminHeader
        userEmail={userEmail}
        onMobileMenuToggle={() => setMobileOpen((prev) => !prev)}
        onSignOut={handleSignOut}
      />

      {/* Main content */}
      <div className="lg:pl-60">
        <div className="pt-[calc(4rem+env(safe-area-inset-top))]">
          {/* Status banner */}
          <StatusBanner
            tenantStatus={tenantStatus}
            trialEndsAt={trialEndsAt}
            periodEnd={periodEnd}
          />

          {/* Page content — slate gradient suave sobre el shell oscuro */}
          <main
            id="main-content"
            className="content-area-gradient mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 min-h-[calc(100vh-4rem)]"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
