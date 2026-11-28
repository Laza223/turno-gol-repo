import { z } from 'zod'
import { dateStr, moneyCents, uuid } from '@/shared/validation/primitives'
import { isValidYearMonth } from '@/lib/month-bounds'

export const settlementChargeLineSchema = z.object({
  amount: moneyCents.refine((v) => v > 0, 'Cada cobro debe ser mayor a $ 0.'),
  method: z.enum(['cash', 'transfer', 'mercadopago', 'other']),
})

const yearMonthStr = z.string().refine(isValidYearMonth, 'Elegí un mes válido (AAAA-MM).')

export const settleAbonadoPeriodSchema = z
  .object({
    abonadoId: uuid,
    kind: z.enum(['pack', 'monthly']),
    paymentOrigin: z.enum(['caja', 'already_settled']),
    amount: moneyCents,
    creditsTotal: z.number().int().min(1).max(52).optional(),
    month: yearMonthStr.optional(),
    startsFromDate: dateStr.optional(),
    charges: z.array(settlementChargeLineSchema).max(10).optional(),
    clientIdempotencyKey: uuid.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'pack' && data.creditsTotal == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['creditsTotal'],
        message: 'Indicá cuántos turnos cubre el pack.',
      })
    }
    if (data.kind === 'monthly' && !data.month) {
      ctx.addIssue({
        code: 'custom',
        path: ['month'],
        message: 'Elegí el mes a cubrir.',
      })
    }
    if (data.paymentOrigin === 'caja') {
      if (data.amount <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['amount'],
          message: 'Para cobrar en Caja ingresá un monto mayor a $ 0.',
        })
      }
      if (!data.charges || data.charges.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['charges'],
          message: 'Elegí al menos un método de pago.',
        })
      }
      if (!data.clientIdempotencyKey) {
        ctx.addIssue({
          code: 'custom',
          path: ['clientIdempotencyKey'],
          message: 'Falta la clave de idempotencia del cobro.',
        })
      }
    }
  })

export const settleBookingsBatchSchema = z
  .object({
    bookingIds: z.array(uuid).min(1, 'Elegí al menos un turno.').max(30),
    paymentOrigin: z.enum(['caja', 'already_settled']),
    amount: moneyCents,
    charges: z.array(settlementChargeLineSchema).max(10).optional(),
    clientIdempotencyKey: uuid.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentOrigin === 'caja') {
      if (data.amount <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['amount'],
          message: 'Para cobrar en Caja ingresá un monto mayor a $ 0.',
        })
      }
      if (!data.charges || data.charges.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['charges'],
          message: 'Elegí al menos un método de pago.',
        })
      }
      if (!data.clientIdempotencyKey) {
        ctx.addIssue({
          code: 'custom',
          path: ['clientIdempotencyKey'],
          message: 'Falta la clave de idempotencia del cobro.',
        })
      }
    }
  })

export const voidSettlementSchema = z.object({
  settlementId: uuid,
})
