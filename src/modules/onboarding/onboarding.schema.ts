import { z } from 'zod'
import { uuid, dateStr, hhmm, hhmmEnd } from '@/shared/validation/primitives'

/**
 * Drafts de canchas del paso 3. El precio es UNO por cancha (modo uniforme,
 * `pages/onboarding.md` §5); el ajuste por franja horaria vive en `/settings/canchas`.
 *
 * Estaba declarado inline dentro de la Server Action.
 *
 * Sin `photos`: el paso 3 dejó de pedirlas (ver el comentario en `actions.ts`).
 * Aceptar el campo "por si acaso" dejaría abierta una entrada de URLs arbitrarias
 * a `courts.photos` que ninguna pantalla escribe.
 */
export const wizardCourtsSchema = z.object({
  courts: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Poné un nombre a cada cancha').max(100),
        format: z.number().int(),
        surfaceType: z.enum(['synthetic_grass', 'natural_grass', 'cement', 'tile']),
        isCovered: z.boolean(),
        priceCents: z.number().int().positive('Cargá el precio por turno de cada cancha'),
      }),
    )
    .max(20, 'Máximo 20 canchas por vez'),
})

type WizardCourtsInput = z.infer<typeof wizardCourtsSchema>
export type WizardCourtDraftInput = WizardCourtsInput['courts'][number]

/**
 * Paso 4 — cargar la primera reserva sobre un slot real de la grilla ya
 * generada (§D del plan de refactor). `date` viaja desde el cliente porque el
 * slot que clickeó viene de la grilla que el SERVER le mandó al renderizar el
 * paso (`getFirstBookingSlots`) — no es un valor que el dueño elige a mano, es
 * el eco de lo que ya vio. `createManualBooking` revalida solapamiento y
 * disponibilidad igual que cualquier otra reserva manual: un `date` viejo
 * (pestaña abierta desde ayer) simplemente no matchea ningún slot disponible.
 */
export const wizardFirstBookingSchema = z.object({
  courtId: uuid,
  date: dateStr,
  timeStart: hhmm,
  timeEnd: hhmmEnd,
  guestName: z.string().trim().min(1, 'Poné a nombre de quién va el turno.').max(200),
})

export type WizardFirstBookingInput = z.infer<typeof wizardFirstBookingSchema>
