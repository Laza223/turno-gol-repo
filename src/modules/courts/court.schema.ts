import { z } from 'zod'

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const HHMM_OR_MIDNIGHT_RE = /^([01]\d|2[0-3]):[0-5]\d$|^00:00$/
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
// Cambio #17: los 8 formatos de fútbol en Argentina (Fútbol 4 al 11).
const VALID_FORMATS = [4, 5, 6, 7, 8, 9, 10, 11] as const

const pricingRuleSchema = z.object({
  days: z.array(z.enum(DAY_KEYS)).min(1, 'Al menos un día requerido'),
  from: z.string().regex(HHMM_RE, 'Formato HH:MM requerido'),
  to: z.string().regex(HHMM_OR_MIDNIGHT_RE, 'Formato HH:MM requerido (00:00 = medianoche)'),
  price: z.number().int().positive('Precio debe ser positivo'),
})

const courtPricingSchema = z.object({
  rules: z.array(pricingRuleSchema).min(1, 'Al menos una regla de precio requerida'),
})

export const createCourtSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
  description: z.string().max(500).optional(),
  surfaceType: z.enum(['synthetic_grass', 'natural_grass', 'cement', 'tile'], {
    error: 'Tipo de superficie inválido',
  }),
  isCovered: z.boolean().optional(),
  hasLighting: z.boolean().optional(),
  format: z
    .number()
    .int()
    .refine(
      (v): v is (typeof VALID_FORMATS)[number] => (VALID_FORMATS as readonly number[]).includes(v),
      'Formato inválido: debe ser Fútbol 4 a 11',
    ),
  pricing: courtPricingSchema,
  photos: z.array(z.string()).optional(),
})

export const updateCourtSchema = createCourtSchema.partial()
