import { z } from 'zod'
import { isAllowedPushEndpoint } from '@/lib/web-push'

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2000).refine(isAllowedPushEndpoint),
  keys: z.object({ p256dh: z.string().min(80).max(200), auth: z.string().min(16).max(200) }),
  userAgent: z.string().max(500).optional(),
})
