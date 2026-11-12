import { z } from 'zod'
import { phone } from '@/shared/validation/primitives'
import {
  wizardCourtCountsSchema,
  wizardPricesSchema,
  wizardProfileSchema,
  wizardScheduleSchema,
} from './onboarding.schema'

/**
 * Borrador del alta pública: todo lo que el dueño contesta ANTES de tener cuenta
 * (el complejo va primero y la cuenta al final, como en la referencia de
 * DeporTurnos). Vive en el celular (`localStorage`) y viaja entero a UNA sola
 * Server Action, que crea la cuenta (o toma la de Google), el complejo, las
 * canchas y los horarios de una vez.
 *
 * El servidor revalida todo: el borrador es input no confiable.
 */
export const signupDraftSchema = z.object({
  complex: z.object({
    name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
    address: z.string().trim().min(5, 'Dirección muy corta').max(200, 'Máximo 200 caracteres'),
    city: z.string().trim().min(2, 'Ciudad muy corta').max(100, 'Máximo 100 caracteres'),
    province: z.string().trim().min(2, 'Provincia muy corta').max(100, 'Máximo 100 caracteres'),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
  }),
  courts: wizardCourtCountsSchema,
  schedule: wizardScheduleSchema,
  prices: wizardPricesSchema,
  profile: wizardProfileSchema,
  /** Celular del dueño: es el WhatsApp del complejo. Google no lo trae. */
  phone,
  /** Código de referido (`?ref=`), ya validado con `referralCodeSchema` por quien lo manda. */
  referralCode: z.string().nullable().optional(),
})

export type SignupDraft = z.infer<typeof signupDraftSchema>
