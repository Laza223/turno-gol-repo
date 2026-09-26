'use client'

import { useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { StaffRole } from '@/modules/staff/roles'
import { NO_SETUP_ALERTS, type SetupAlerts } from './setup-alerts'
import { AdminSidebar } from './admin-sidebar'
import { AdminBottomNav } from './admin-bottom-nav'
import { AdminHeader } from './admin-header'
import { SetupAlertsProvider } from './setup-alerts-context'
import { StatusBanner } from './status-banner'
import { PushNotificationManagerLoader } from '@/components/admin/PushNotificationManagerLoader'

/** Días de prueba que le quedan al complejo, o null si no está en prueba. */
function trialDaysLeft(tenantStatus: string, trialEndsAt: string | null): number | null {
  if (tenantStatus !== 'trialing' || !trialEndsAt) return null
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000))
}

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
  /** Lo que le falta completar al complejo: prende los puntos rojos del menú y de las
   *  pestañas de Configuración. Sin valor, sin avisos. */
  setupAlerts?: SetupAlerts
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
  setupAlerts = NO_SETUP_ALERTS,
}: AdminLayoutShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [, startTransition] = useTransition()
  const pathname = usePathname()
  // Dos modos de contenedor. Grilla y Agenda (ex-Reservas, lista) son viewport fijo
  // full-bleed: sin tope de ancho y sin scroll de página propio, cada una
  // resuelve el scroll adentro (GridScroller / la lista). Comparación
  // exacta: `/reservas/[id]` sigue con el modo normal.
  // Todo lo demás es scroll de página normal con tope de 1600 px: el viejo
  // `max-w-7xl` dejaba ~320 px muertos de cada lado en un monitor de 1920, y
  // sin tope alguno una fila de lista se estira de punta a punta y el ojo pierde
  // el renglón. El fondo (`content-area-gradient`) va en el contenedor SIN tope,
  // no en el `<main>`: si no, el tope dibuja una caja con franjas de otro tono.
  const isFullBleed = pathname === '/grilla' || pathname === '/reservas'

  function handleSignOut() {
    startTransition(async () => {
      await signOut()
    })
  }

  return (
    // dvh y no vh: en iOS `100vh` incluye la barra de URL, así que el contenedor
    // queda más alto que el área visible — y con `overflow-hidden` el excedente
    // es INALCANZABLE (los últimos turnos de la grilla no se podían tocar).
    <div className={cn('min-h-dvh shell-bg', isFullBleed && 'h-dvh overflow-hidden flex flex-col')}>
      {/* Riel de 72 px (el cajón mobile lo trae el Sheet de AdminSidebar) */}
      <AdminSidebar
        tenantName={tenantName}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        userEmail={userEmail}
        onSignOut={handleSignOut}
        tournamentsEnabled={tournamentsEnabled}
        staffRole={staffRole}
        setupAlerts={setupAlerts}
        trialDaysLeft={trialDaysLeft(tenantStatus, trialEndsAt)}
      />

      {/* Header */}
      <AdminHeader tenantName={tenantName} homeHref="/dashboard" />

      {/* Navegación primaria en mobile (Fase 4): reemplaza a la hamburguesa. */}
      <AdminBottomNav
        onOpenMore={() => setMobileOpen(true)}
        moreOpen={mobileOpen}
        tournamentsEnabled={tournamentsEnabled}
        staffRole={staffRole}
        setupAlerts={setupAlerts}
      />

      {/* Main content */}
      <div
        className={cn(
          'content-area-gradient lg:pl-[72px]',
          isFullBleed && 'h-dvh flex flex-col min-h-0 overflow-hidden',
        )}
      >
        <div
          className={cn(
            'pt-[calc(3.75rem+env(safe-area-inset-top))]',
            isFullBleed && 'flex-1 flex flex-col min-h-0 overflow-hidden',
          )}
        >
          {/* Banner de impersonación (super admin): pegado bajo el header */}
          {impersonationBanner}

          {/* Estado de la cuenta, solo cuando corta o puede cortar el servicio.
              El período de prueba va en el riel, arriba de Ayuda. */}
          <StatusBanner tenantStatus={tenantStatus} periodEnd={periodEnd} />

          {/* Page content — slate gradient suave sobre el shell oscuro */}
          {/* El `pb` de mobile reserva el alto de AdminBottomNav (3.5rem) más el
              safe-area de iOS: sin eso la barra fija tapa el último turno de la
              grilla y el último movimiento de caja. En lg la barra no existe. */}
          {/* `isolate`: los z-index de la página (encabezados sticky de la
              grilla, z-30/z-40) quedan encerrados acá y nunca le pasan por
              encima al riel (z-30) ni a la barra superior (z-20). Los modales
              salen por portal a <body>, así que no los afecta. */}
          <main
            id="main-content"
            className={cn(
              'isolate mx-auto w-full px-4 sm:px-6 lg:px-8',
              isFullBleed
                ? 'max-w-full flex-1 flex flex-col min-h-0 overflow-hidden pt-4 pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-4'
                : 'max-w-[1600px] pt-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-8 min-h-[calc(100dvh-3.75rem)]',
            )}
          >
            {/* Va acá, en flujo y dentro del contenedor de la página, y no como
                overlay fijo: ver el comentario del propio componente. */}
            <PushNotificationManagerLoader />
            <SetupAlertsProvider alerts={setupAlerts}>{children}</SetupAlertsProvider>
          </main>
        </div>
      </div>
    </div>
  )
}
