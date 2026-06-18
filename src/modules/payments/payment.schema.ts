import { z } from 'zod'
import { computeMpMockEnabled } from './mock-mp'

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
          // Mock ids are accepted only when the env-mock gateway is active.
          // Use the same hard gate as the rest of the system
          // (`MP_MOCK_MODE=1` AND `NODE_ENV !== 'production'`) so a leaked
          // `MP_MOCK_MODE=1` in prod can't make the schema accept MOCK-* ids.
          (computeMpMockEnabled() && MOCK_MP_ID_RE.test(v)),
        'invalid mpPaymentId',
      ),
  }),
  date_created: z.string().optional(),
  user_id: z.union([z.string(), z.number()]).optional(),
  api_version: z.string().optional(),
  live_mode: z.boolean().optional(),
})

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>

// ── Output (response) contracts — doc15 §2 ────────────────────────────────────
// The MP webhook ACKs with a tiny body: `{ ok: true }`, plus `ignored` for
// event types we deliberately skip. Error paths keep their compact machine-facing
// shape and are not validated here.
export const webhookResponseSchema = z
  .object({
    ok: z.literal(true),
    ignored: z.string().optional(),
  })
  .strict()

// Deposit/payment status as polled by the player on the pending-payment screen
// (GET /api/player/bookings/:id/status → `{ data: { status, depositStatus, expiresAt } }`).
export const paymentStatusResponseSchema = z
  .object({
    data: z
      .object({
        status: z.enum([
          'pending_payment',
          'confirmed',
          'expired',
          'canceled_refunded',
          'canceled_no_refund',
          'completed',
          'no_show',
        ]),
        depositStatus: z.enum(['not_required', 'pending', 'paid', 'refunded', 'captured']),
        expiresAt: z.string(),
      })
      .strict(),
  })
  .strict()
