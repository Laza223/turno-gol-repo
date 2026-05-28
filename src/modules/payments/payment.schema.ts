import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = z.string().regex(UUID_RE, 'UUID inválido')

const MP_ID_RE = /^\d{1,32}$/
// Mock payment ids (only accepted when MP_MOCK_MODE=1): MOCK-(APPROVED|REJECTED)-<uuid>
const MOCK_MP_ID_RE = /^MOCK-(APPROVED|REJECTED)-[0-9a-fA-F-]{36}$/

export const createDepositPaymentSchema = z.object({
  bookingId: uuid,
})

export const refundSchema = z.object({
  paymentId: uuid,
  amount: z.number().int().positive().optional(),
})

/**
 * MP IPN/webhook v2 payload. The top-level `id` is the **event id** (idempotency
 * key); `data.id` is the MP payment id (used to fetch payment details).
 */
export const webhookPayloadSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  type: z.string(),
  action: z.string().optional(),
  data: z.object({
    id: z
      .union([z.string(), z.number()])
      .transform((v) => String(v))
      .refine(
        (v) =>
          MP_ID_RE.test(v) ||
          (process.env.MP_MOCK_MODE === '1' && MOCK_MP_ID_RE.test(v)),
        'invalid mpPaymentId',
      ),
  }),
  date_created: z.string().optional(),
  user_id: z.union([z.string(), z.number()]).optional(),
  api_version: z.string().optional(),
  live_mode: z.boolean().optional(),
})

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>
