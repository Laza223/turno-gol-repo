import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const uuid = z.string().regex(UUID_RE, 'UUID inválido')
const dateStr = z.string().regex(DATE_RE, 'Formato YYYY-MM-DD requerido')
const hhmm = z.string().regex(HHMM_RE, 'Formato HH:MM requerido')
const duration = z.union([z.literal(60), z.literal(120)])

export const createOnlineBookingSchema = z.object({
  playerId: uuid,
  courtId: uuid,
  date: dateStr,
  timeStart: hhmm,
  timeEnd: hhmm,
  durationMins: duration,
  requiresDeposit: z.boolean(),
  depositPercentage: z.number().int().min(0).max(100),
  notesPlayer: z.string().max(1000).optional(),
})

export const createManualBookingSchema = z
  .object({
    courtId: uuid,
    date: dateStr,
    timeStart: hhmm,
    timeEnd: hhmm,
    durationMins: duration,
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
      // spontaneous: either playerId, or both guest fields, or neither (admin reservation)
      if (v.playerId) return !v.guestName && !v.guestPhone
      if (v.guestName || v.guestPhone) return Boolean(v.guestName && v.guestPhone)
      return true
    },
    {
      message:
        'Reserva manual: usar playerId, o (guestName + guestPhone), o ninguno. No mezclar.',
    },
  )

export const completeBookingSchema = z.object({
  bookingId: uuid,
})

export const markNoShowSchema = z.object({
  bookingId: uuid,
})

export const expirePendingBookingSchema = z.object({
  bookingId: uuid,
})

export const getAvailableSlotsSchema = z.object({
  courtId: uuid,
  date: dateStr,
  durationMins: duration,
})
