'use client'

import dynamic from 'next/dynamic'

// `dynamic(..., { ssr: false })` sólo se puede declarar dentro de un Client
// Component: desde Next 15 hacerlo en un Server Component es error de build duro.
// `(admin)/layout.tsx` es un Server Component async, así que el dynamic vive acá.
// Mismo patrón que ExplorarMapLoader / InviteStaffButton / CajaActions.
const PushNotificationManager = dynamic(
  () => import('@/components/admin/PushNotificationManager').then((m) => m.PushNotificationManager),
  { ssr: false, loading: () => null },
)

export function PushNotificationManagerLoader() {
  return <PushNotificationManager />
}
