'use client'

import Link from 'next/link'
import { LayoutGrid, MoonStar } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Realtime se cayó y la grilla pasó a polling.
 *
 * Es un div de warning ámbar y NO `ErrorState`: la degradación es RECUPERABLE, y
 * la paleta roja de `ErrorState` implicaría un error fatal — sobreactuaría la
 * severidad de algo que se arregla solo cuando vuelve el websocket.
 */
export function GridOfflineBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200"
    >
      Sin conexión. Los datos pueden no estar actualizados.
    </div>
  )
}

/**
 * El complejo todavía no configuró ninguna cancha.
 *
 * `BookingGrid` no recibe el rol del staff logueado (`grilla/page.tsx` sólo
 * valida `user.type === 'staff'`), y agregar esa prop sería scope creep. El CTA
 * se muestra igual para cualquier staff: `/settings/canchas` es de solo-lectura
 * para el manager (`CourtList` ya oculta "+ Nueva cancha" si `!isAdmin`), así
 * que navegar ahí nunca habilita una escritura no autorizada.
 */
export function NoCourtsEmptyState() {
  return (
    <EmptyState
      icon={LayoutGrid}
      title="Sin canchas configuradas"
      description="Todavía no agregaste ninguna cancha. Configurá al menos una para empezar a tomar turnos."
      action={
        <Link
          href="/settings/canchas"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-10"
        >
          Configurar la primera cancha
        </Link>
      }
    />
  )
}

/**
 * El día está marcado como cerrado en la configuración de horarios.
 *
 * Mismo razonamiento que arriba sobre el rol. A diferencia de `/canchas`,
 * `/settings/*` completo es solo-admin (`SettingsLayout` hace
 * `requireAdminStaff`): si un manager toca este link rebota a `/dashboard` sin
 * romper nada, así que sigue siendo inofensivo dejarlo visible.
 */
export function ClosedDayEmptyState() {
  return (
    <EmptyState
      icon={MoonStar}
      title="Complejo cerrado este día"
      description="Este día está marcado como cerrado en la configuración de horarios."
      action={
        <Link
          href="/settings/horarios"
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-10"
        >
          Revisar horarios
        </Link>
      }
    />
  )
}
