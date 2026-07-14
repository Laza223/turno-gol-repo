import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = z.string().regex(UUID_RE, 'UUID inválido')

// ─── Input ──────────────────────────────────────────────────────
export const createReviewSchema = z.object({
  bookingId: uuid,
  rating: z
    .number()
    .int()
    .min(1, 'La calificación mínima es 1')
    .max(5, 'La calificación máxima es 5'),
  comment: z
    .string()
    .max(500, 'El comentario no puede superar los 500 caracteres')
    .optional(),
})

export const listReviewsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

// ─── Output (contract, doc15) ───────────────────────────────────
const reviewItemResponseSchema = z.strictObject({
  id: uuid,
  tenantId: uuid,
  playerId: uuid,
  bookingId: uuid,
  rating: z.number().int(),
  comment: z.string().nullable(),
  createdAt: z.string(), // ISO 8601 sobre el cable
})

export const createReviewResponseSchema = z.strictObject({ data: reviewItemResponseSchema })
