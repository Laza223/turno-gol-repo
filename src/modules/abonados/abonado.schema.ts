import { z } from 'zod'
import {
  uuid,
  dateStr,
  hhmm,
  hhmmEnd,
  moneyCents,
  boundedText,
} from '@/shared/validation/primitives'

// timeEnd usa hhmmEnd (no hhmm): un abonado puede terminar exactamente a
// medianoche ('24:00', ENS-13 — misma clase que ENS-12 en reservas comunes).
//
// Vive acá (módulo, no en `abonados/actions.ts`) porque ese archivo es
// `'use server'`: Next.js exige que TODO export de un archivo `'use server'`
// sea una función async (ver "A 'use server' file can only export async
// functions" — descubierto en build real, `tsc`/`vitest` no lo detectan).
// `nuevo/actions.ts` ya valida timeEnd/timeStart antes de llegar acá (su
// propio schema local acepta HH:MM/HH:MM:SS sin restringir el rango de hora),
// pero ESTE es el gate que de verdad corre dentro de createAbonadoAction.
export const createAbonadoSchema = z.object({
  courtId: uuid,
  playerId: uuid.optional(),
  contactName: boundedText(120).min(1),
  contactPhone: boundedText(40).min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  timeStart: hhmm,
  timeEnd: hhmmEnd,
  pricePerSession: moneyCents,
  startsOn: dateStr,
  endsOn: dateStr.optional(),
  paymentMethod: z.enum(['cash', 'transfer']).optional(),
})
