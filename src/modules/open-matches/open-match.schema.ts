import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = z.string().regex(UUID_RE, 'UUID inválido')

const openMatchStatus = z.enum(['open', 'full', 'canceled', 'completed'])

const restrictionsSchema = z
  .object({
    gender: z.enum(['male', 'female', 'mixed']).optional(),
    level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    minAge: z.number().int().min(0).max(120).optional(),
    notes: z.string().max(200, 'Las restricciones no pueden superar 200 caracteres').optional(),
  })
  .strict()

// ─── Input ──────────────────────────────────────────────────────
export const createOpenMatchSchema = z.object({
  bookingId: uuid,
  slotsTotal: z
    .number()
    .int()
    .min(1, 'Tiene que faltar al menos 1 jugador')
    .max(21, 'Máximo 21 jugadores'),
  restrictions: restrictionsSchema.optional(),
})

export const listOpenMatchesQuerySchema = z.object({
  tenantId: uuid.optional(),
  city: z.string().max(120).optional(),
  province: z.string().max(120).optional(),
  status: openMatchStatus.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

// ─── Output ─────────────────────────────────────────────────────
const openMatchItemResponseSchema = z
  .object({
    id: uuid,
    bookingId: uuid,
    creatorPlayerId: uuid,
    tenantId: uuid,
    slotsTotal: z.number().int(),
    slotsFilled: z.number().int(),
    restrictions: z.record(z.unknown()),
    status: openMatchStatus,
    createdAt: z.string(),
    expiresAt: z.string().nullable(),
  })
  .strict()

// Card pública: sin creatorPlayerId/bookingId (UUIDs internos — Ley 25.326).
const openMatchCardResponseSchema = z
  .object({
    id: uuid,
    tenantId: uuid,
    slotsTotal: z.number().int(),
    slotsFilled: z.number().int(),
    slotsRemaining: z.number().int(),
    restrictions: z.record(z.unknown()),
    status: openMatchStatus,
    createdAt: z.string(),
    expiresAt: z.string().nullable(),
    tenant: z
      .object({
        slug: z.string(),
        name: z.string(),
        city: z.string(),
        province: z.string(),
        logoUrl: z.string().nullable(),
      })
      .strict(),
  })
  .strict()

export const openMatchesPageResponseSchema = z
  .object({
    matches: z.array(openMatchCardResponseSchema),
    total: z.number().int(),
  })
  .strict()

export const openMatchResponseSchema = z
  .object({ data: openMatchItemResponseSchema })
  .strict()
