import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = z.string().regex(UUID_RE, 'UUID inválido')

const billingCycle = z.enum(['monthly', 'annual'])

export const subscribeSchema = z.object({
  planId: uuid,
  billingCycle,
})

export const upgradeSchema = z.object({
  targetPlanId: uuid,
})

export const downgradeSchema = z.object({
  targetPlanId: uuid,
})

export const cancelSchema = z.object({
  reason: z.string().min(1, 'Ingresá el motivo').max(500, 'Máximo 500 caracteres'),
})

export const reactivateSchema = z.object({
  planId: uuid,
  billingCycle,
})
