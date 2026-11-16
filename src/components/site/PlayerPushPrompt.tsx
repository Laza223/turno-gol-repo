'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import type { PushSubscriptionActions } from '@/components/admin/push-browser'
import { usePortalSession } from './PortalSessionProvider'

// Sin SSR: detecta permiso y suscripción del navegador. Mismo patrón que
// PushNotificationManagerLoader del panel.
const PushNotificationManager = dynamic(
  () => import('@/components/admin/PushNotificationManager').then((m) => m.PushNotificationManager),
  { ssr: false, loading: () => null },
)

/**
 * Aviso de permiso del jugador (decisión 2026-11-16): solo con un jugador
 * logueado. La primera vez que llega al portal después de registrarse se abre
 * el modal propio; después, mientras este dispositivo no reciba avisos, un
 * cartel chico arriba del contenido. Si ya los recibe, no se muestra nada.
 */
// El modal se abre solo en pantallas de calma: las del jugador y la vuelta de una
// reserva confirmada. Nunca en medio de reservar (ficha del complejo, pago
// pendiente o con error): ahí queda solo el cartel.
const CALM_PATHS = ['/mis-reservas', '/perfil', '/configuracion', '/rival', '/explorar']
function isCalmPath(pathname: string): boolean {
  return (
    CALM_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    /^\/reserva\/[^/]+\/exito$/.test(pathname)
  )
}

export function PlayerPushPrompt({ actions }: { actions?: PushSubscriptionActions }) {
  const { session } = usePortalSession()
  const pathname = usePathname()
  if (!session || !actions) return null
  return (
    <PushNotificationManager
      audience="player"
      identityKey={`player:${session.playerId}`}
      actions={actions}
      autoOpen={isCalmPath(pathname)}
      bannerClassName="mx-auto mt-3 mb-0 max-w-3xl px-4 sm:mt-4"
    />
  )
}
