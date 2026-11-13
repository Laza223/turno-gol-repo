import { z } from 'zod'
import { COURT_FORMATS } from '@/modules/courts/court.schema'

/** Formatos que ofrece el alta: los mismos 8 de `/canchas` (Fútbol 4 al 11). */
export const WIZARD_FORMATS = COURT_FORMATS

export const MAX_WIZARD_COURTS = 20

/** Corte día/noche por defecto del paso Precios ("desde las 18"). */
export const DEFAULT_CUT_HOUR = 18

const wizardFormat = z
  .number()
  .int()
  .refine((v) => (WIZARD_FORMATS as readonly number[]).includes(v), 'Formato inválido')

/**
 * Paso Canchas: cantidad por formato, entre 1 y 20 en total. Llega como
 * `{ "5": 2, "7": 1 }` (la forma en que se guarda en
 * `settings.onboarding_draft_courts`); los formatos en 0 se descartan.
 */
export const wizardCourtCountsSchema = z
  .record(z.string(), z.number().int().min(0).max(MAX_WIZARD_COURTS))
  .superRefine((counts, ctx) => {
    for (const key of Object.keys(counts)) {
      if (!(WIZARD_FORMATS as readonly number[]).includes(Number(key))) {
        ctx.addIssue({ code: 'custom', message: 'Formato inválido' })
      }
    }
  })
  .transform((counts) => {
    const out: Record<string, number> = {}
    for (const [format, count] of Object.entries(counts)) if (count > 0) out[format] = count
    return out
  })
  .refine((counts) => Object.values(counts).reduce((a, b) => a + b, 0) >= 1, {
    message: 'Elegí al menos una cancha.',
  })
  .refine((counts) => Object.values(counts).reduce((a, b) => a + b, 0) <= MAX_WIZARD_COURTS, {
    message: `Máximo ${MAX_WIZARD_COURTS} canchas. Después podés cargar más desde Canchas.`,
  })

/**
 * Paso Horarios: apertura y cierre en hora entera, el mismo horario los 7 días.
 * `closeHour` 0 = medianoche; 1-4 = madrugada del día siguiente; el resto, mismo día.
 */
export const wizardScheduleSchema = z
  .object({
    openHour: z.number().int().min(0).max(23),
    closeHour: z.number().int().min(0).max(23),
  })
  .refine((v) => v.closeHour === 0 || v.closeHour <= 4 || v.closeHour > v.openHour, {
    message: 'El cierre tiene que ser después de la apertura.',
    path: ['closeHour'],
  })

/** Tope razonable de un turno: $1.000.000. Atrapa un cero de más al tipear. */
const MAX_PRICE_CENTS = 100_000_000

const priceCents = z.number().int().positive('Cargá cuánto cobrás el turno.').max(MAX_PRICE_CENTS)

/**
 * Paso Precios: un precio por formato (turno de 60 min), con precio de noche
 * opcional a partir de `cutHour`. Montos en centavos.
 */
export const wizardPricesSchema = z.object({
  formats: z
    .array(
      z.object({
        format: wizardFormat,
        count: z.number().int().min(1).max(MAX_WIZARD_COURTS),
        dayPrice: priceCents,
        nightPrice: priceCents.optional(),
      }),
    )
    .min(1, 'Elegí al menos una cancha.')
    .refine((rows) => new Set(rows.map((r) => r.format)).size === rows.length, 'Formato repetido')
    .refine((rows) => rows.reduce((a, r) => a + r.count, 0) <= MAX_WIZARD_COURTS, {
      message: `Máximo ${MAX_WIZARD_COURTS} canchas.`,
    }),
  cutHour: z.number().int().min(1).max(23).optional(),
})

export type WizardPricesInput = z.infer<typeof wizardPricesSchema>

/** Paso Tu complejo: tres respuestas de opción. */
export const wizardProfileSchema = z.object({
  bookingIntake: z.enum(['notebook', 'whatsapp', 'other_app', 'new'], {
    error: 'Elegí cómo tomás los turnos hoy.',
  }),
  hasFixedTeams: z.boolean({ error: 'Contanos si tenés equipos fijos.' }),
  canteenEnabled: z.boolean({ error: 'Contanos si tenés buffet o kiosco.' }),
})

export type WizardProfileInput = z.infer<typeof wizardProfileSchema>
