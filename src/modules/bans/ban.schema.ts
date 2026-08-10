import { z } from 'zod'
import { uuid } from '@/shared/validation/primitives'

/**
 * Validación del ban manual del complejo (doc7 Flujo 5B, ENS-8). Separado de
 * ban.service.ts para que las Server Actions importen un *.schema (regression
 * guard tests/unit/zod-coverage.test.ts) y sea unit-testeable sin DB — mismo
 * patrón que super-admin/support.schema.ts.
 */
const BAN_DURATIONS = ['7d', '30d', 'indefinite'] as const
export type ManualBanDuration = (typeof BAN_DURATIONS)[number]

export const banPlayerInputSchema = z.object({
  playerId: uuid,
  reason: z.string().trim().min(1, 'El motivo es obligatorio.').max(500),
  duration: z.enum(BAN_DURATIONS),
})

export const liftPlayerBanInputSchema = z.object({
  playerId: uuid,
})
