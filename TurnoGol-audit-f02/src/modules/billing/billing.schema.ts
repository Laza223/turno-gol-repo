import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = z.string().regex(UUID_RE, 'UUID inválido')

const billingCycle = z.enum(['monthly', 'annual'])

export const subscribeSchema = z.object({
  planId: uuid,
  billingCycle,
})
export type SubscribeInput = z.infer<typeof subscribeSchema>

export const upgradeSchema = z.object({
  targetPlanId: uuid,
})
export type UpgradeInput = z.infer<typeof upgradeSchema>

export const downgradeSchema = z.object({
  targetPlanId: uuid,
})
export type DowngradeInput = z.infer<typeof downgradeSchema>

export const cancelSchema = z.object({
  reason: z.string().min(1).max(500),
})
export type CancelInput = z.infer<typeof cancelSchema>

export const reactivateSchema = z.object({
  planId: uuid,
  billingCycle,
})
export type ReactivateInput = z.infer<typeof reactivateSchema>
