import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = z.string().regex(UUID_RE, 'UUID inválido')

// ─── Input ──────────────────────────────────────────────────────
export const toggleFavoriteSchema = z.object({
  tenantId: uuid,
})

// ─── Output ─────────────────────────────────────────────────────
export const toggleFavoriteResponseSchema = z.strictObject({
  data: z.strictObject({
    tenantId: uuid,
    favorited: z.boolean(),
  }),
})
