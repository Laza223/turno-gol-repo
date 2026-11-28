import { z } from 'zod'
import {
  uuid,
  dateStr,
  hhmm,
  hhmmEnd,
  moneyCents,
  boundedText,
} from '@/shared/validation/primitives'
import { isValidYearMonth } from '@/lib/month-bounds'
import { settlementChargeLineSchema } from '@/modules/settlements/settlement.schema'

const initialSettlementSchema = z
  .object({
    kind: z.enum(['pack', 'monthly']),
    paymentOrigin: z.enum(['caja', 'already_settled']),
    amount: moneyCents,
    creditsTotal: z.number().int().min(1).max(52).optional(),
    month: z.string().refine(isValidYearMonth, 'Elegí un mes válido.').optional(),
    charges: z.array(settlementChargeLineSchema).max(10).optional(),
    clientIdempotencyKey: uuid.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'pack' && data.creditsTotal == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['creditsTotal'],
        message: 'Indicá los turnos del pack.',
      })
    }
    if (data.kind === 'monthly' && !data.month) {
      ctx.addIssue({ code: 'custom', path: ['month'], message: 'Elegí el mes a cubrir.' })
    }
    if (data.paymentOrigin === 'caja' && (data.amount <= 0 || !data.charges?.length)) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Indicá el monto y el método.' })
    }
    // Cobrar en Caja sin clave deja reintentar un doble cobro: la clave es obligatoria.
    if (data.paymentOrigin === 'caja' && !data.clientIdempotencyKey) {
      ctx.addIssue({
        code: 'custom',
        path: ['clientIdempotencyKey'],
        message: 'Falta la clave de idempotencia del cobro.',
      })
    }
  })

export const createAbonadoSchema = z
  .object({
    courtId: uuid,
    playerId: uuid.optional(),
    contactName: boundedText(120).min(1, 'Ingresá el nombre de contacto'),
    contactPhone: boundedText(40).min(1, 'Ingresá un teléfono de contacto').optional(),
    viaWeeklyEvent: z.boolean().optional(),
    dayOfWeek: z.number().int().min(0, 'Elegí un día válido').max(6, 'Elegí un día válido'),
    timeStart: hhmm,
    timeEnd: hhmmEnd,
    pricePerSession: moneyCents,
    billingMode: z.enum(['per_session', 'monthly', 'pack']).optional(),
    agreedAmount: moneyCents.optional(),
    initialSettlement: initialSettlementSchema.optional(),
    startsOn: dateStr,
    endsOn: dateStr.optional(),
    paymentMethod: z.enum(['cash', 'transfer']).optional(),
  })
  .refine(
    (data) => data.viaWeeklyEvent === true || data.billingMode === 'monthly' || !!data.contactPhone,
    {
      message: 'Ingresá un teléfono de contacto',
      path: ['contactPhone'],
    },
  )

export const updateAbonadoAgreementSchema = z.object({
  abonadoId: uuid,
  billingMode: z.enum(['per_session', 'monthly', 'pack']),
  pricePerSession: moneyCents,
  agreedAmount: moneyCents,
})

/**
 * Editar un turno fijo en TODAS sus fechas futuras. Todo opcional, pero al menos
 * un campo. `playerId` no entra a propósito: cambiar o desvincular la cuenta de
 * un fijo cambia quién ve la reserva y toca datos personales (decisión del
 * 2026-11-08, ver el spec). El precio del fijo es siempre > 0 (chk_abonado_price_positive);
 * una fecha suelta sí puede valer 0, pero eso se corrige fecha por fecha.
 */
export const updateAbonadoSchema = z
  .object({
    courtId: uuid.optional(),
    contactName: boundedText(120).trim().min(1, 'Ingresá el nombre').optional(),
    contactPhone: boundedText(40).trim().min(1, 'Ingresá un teléfono de contacto').optional(),
    dayOfWeek: z
      .number()
      .int()
      .min(0, 'Elegí un día válido')
      .max(6, 'Elegí un día válido')
      .optional(),
    timeStart: hhmm.optional(),
    timeEnd: hhmmEnd.optional(),
    pricePerSession: z.number().int().positive('El precio tiene que ser mayor a cero').optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'No cambiaste nada.',
  })
  .refine((d) => (d.timeStart === undefined) === (d.timeEnd === undefined), {
    message: 'Para cambiar el horario elegí desde y hasta.',
    path: ['timeEnd'],
  })
  .refine((d) => d.timeStart === undefined || d.timeEnd === undefined || d.timeEnd > d.timeStart, {
    message: 'El horario de fin tiene que ser posterior al de inicio.',
    path: ['timeEnd'],
  })
