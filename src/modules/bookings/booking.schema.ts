import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const uuid = z.string().regex(UUID_RE, 'UUID inválido')
const dateStr = z.string().regex(DATE_RE, 'Formato YYYY-MM-DD requerido')
const hhmm = z.string().regex(HHMM_RE, 'Formato HH:MM requerido')

export const createManualBookingSchema = z
  .object({
    courtId: uuid,
    date: dateStr,
    timeStart: hhmm,
    timeEnd: hhmm,
    type: z.enum(['spontaneous', 'block']),
    staffUserId: uuid,
    playerId: uuid.optional(),
    guestName: z.string().min(1).max(200).optional(),
    guestPhone: z.string().min(1).max(50).optional(),
    priceOverride: z.number().int().nonnegative().optional(),
    depositAmount: z.number().int().nonnegative().optional(),
    depositMethod: z.enum(['cash', 'transfer', 'mercadopago', 'other']).optional(),
    depositStatus: z
      .enum(['not_required', 'pending', 'paid', 'refunded', 'captured'])
      .optional(),
    notesInternal: z.string().max(1000).optional(),
    notesPlayer: z.string().max(1000).optional(),
  })
  .refine(
    (v) => {
      if (v.type === 'block') return true
      // Reserva manual flexible: el admin puede agendar un jugador registrado
      // (playerId) O dejar datos de invitado sueltos (guestName y/o guestPhone,
      // ambos opcionales e independientes) O ninguno. Lo único inválido es
      // mezclar un jugador registrado con datos de invitado.
      if (v.playerId) return !v.guestName && !v.guestPhone
      return true
    },
    {
      message:
        'Reserva manual: no combinar un jugador registrado con datos de invitado.',
    },
  )

// ── Output (response) contracts — doc15 §2 ────────────────────────────────────
// Mirror `BookingRow` (booking.types.ts) as serialized over the wire: Date fields
// become ISO strings. `.strict()` so a new/renamed field surfaces as drift. Used
// by `validateApiOutput` on the booking mutation endpoints (create/cancel/
// complete/no-show), all of which respond `{ data: BookingRow }`.
const bookingRowResponseSchema = z
  .object({
    id: uuid,
    tenantId: uuid,
    courtId: uuid,
    playerId: uuid.nullable(),
    abonadoId: uuid.nullable(),
    createdByStaff: z.string().nullable(),
    date: z.string(),
    timeStart: z.string(),
    timeEnd: z.string(),
    type: z.enum(['spontaneous', 'fixed', 'block']),
    status: z.enum([
      'pending_payment',
      'confirmed',
      'expired',
      'canceled_refunded',
      'canceled_no_refund',
      'completed',
      'no_show',
    ]),
    priceSnapshot: z.number().int(),
    depositAmount: z.number().int(),
    depositStatus: z.enum(['not_required', 'pending', 'paid', 'refunded', 'captured']),
    paymentMethod: z.enum(['cash', 'transfer', 'mercadopago', 'other']).nullable(),
    paymentId: z.string().nullable(),
    notesInternal: z.string().nullable(),
    notesPlayer: z.string().nullable(),
    guestName: z.string().nullable(),
    guestPhone: z.string().nullable(),
    canceledReason: z.string().nullable(),
    canceledBy: z.enum(['player', 'admin', 'system']).nullable(),
    canceledAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict()

export const bookingResponseSchema = z.object({ data: bookingRowResponseSchema }).strict()
