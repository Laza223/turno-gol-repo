import type { PushSendJobData } from '@/shared/jobs/definitions'
import type { TemplateName } from './templates'

export const STAFF_NOTIFICATIONS_V2_FLAG = 'staff_notifications_v2'

export type StaffNotificationEvent = {
  tenantId: string
  eventKey: string
  type: string
  payload: PushSendJobData['payload']
  audience: 'staff' | 'owners'
  policy: 'push_only' | 'push_preferred' | 'email_and_push'
  email?: { templateName: TemplateName; content: Record<string, unknown> }
  notBefore?: Date
  expiresAt: Date
  /** Sólo tests iniciados por el propio usuario; nunca viajan en el payload público. */
  recipientId?: string
  subscriptionId?: string
}

export type StaffNotificationContent = Pick<
  StaffNotificationEvent,
  'payload' | 'audience' | 'policy' | 'email' | 'subscriptionId'
>
