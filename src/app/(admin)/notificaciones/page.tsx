import { redirect } from 'next/navigation'
import { Bell } from 'lucide-react'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { PageHeader } from '@/components/admin/PageHeader'
import { PushNotificationManager } from '@/components/admin/PushNotificationManager'
import {
  pushStatusAction,
  subscribePushAction,
  testPushAction,
  unsubscribePushAction,
} from './actions'

export default async function NotificationsPage() {
  const auth = await requireOperatorStaff({ allowReadOnly: true, allowFree: true })
  if (!auth.ok) redirect(auth.reason === 'plan' ? '/reactivar' : '/dashboard')
  const impersonating = await getImpersonationSession()
  return (
    <div className="space-y-5">
      <PageHeader
        title="Notificaciones"
        subtitle="Enterate de las reservas en tu teléfono."
        icon={<Bell className="h-5 w-5 text-primary" />}
      />
      {impersonating ? (
        <p className="text-sm text-muted-foreground">
          Salí de la impersonación para configurar las notificaciones de tu propio dispositivo.
        </p>
      ) : (
        <PushNotificationManager
          settings
          identityKey={`${auth.tenant.id}:${auth.user.staffUserId}`}
          actions={{
            subscribe: subscribePushAction,
            unsubscribe: unsubscribePushAction,
            test: testPushAction,
            status: pushStatusAction,
          }}
        />
      )}
    </div>
  )
}
