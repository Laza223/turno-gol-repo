import { z } from 'zod'

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const HHMM_OR_MIDNIGHT_RE = /^([01]\d|2[0-3]):[0-5]\d$|^00:00$/
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const VALID_CAPACITIES = [5, 7, 8, 9, 11] as const

export const pricingRuleSchema = z.object({
  days: z.array(z.enum(DAY_KEYS)).min(1, 'Al menos un día requerido'),
  from: z.string().regex(HHMM_RE, 'Formato HH:MM requerido'),
  to: z.string().regex(HHMM_OR_MIDNIGHT_RE, 'Formato HH:MM requerido (00:00 = medianoche)'),
  price: z.number().int().positive('Precio debe ser positivo'),
})

export const courtPricingSchema = z.object({
  rules: z.array(pricingRuleSchema).min(1, 'Al menos una regla de precio requerida'),
})

export const createCourtSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
  description: z.string().max(500).optional(),
  surfaceType: z.enum(['synthetic_grass', 'natural_grass', 'cement', 'indoor'], {
    errorMap: () => ({ message: 'Tipo de superficie inválido' }),
  }),
  capacity: z
    .number()
    .int()
    .refine((v): v is (typeof VALID_CAPACITIES)[number] =>
      (VALID_CAPACITIES as readonly number[]).includes(v),
      'Capacidad inválida: debe ser 5, 7, 8, 9 u 11',
    ),
  pricing: courtPricingSchema,
})

export const updateCourtSchema = createCourtSchema.partial()
