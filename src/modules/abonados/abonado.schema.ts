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
export const createAbonadoSchema = z
  .object({
    courtId: uuid,
    playerId: uuid.optional(),
    contactName: boundedText(120).min(1, 'Ingresá el nombre de contacto'),
    // Opcional desde la migr. 088 (D1): el evento semanal de la grilla puede no
    // tener teléfono. Turno fijo y /abonados/nuevo lo siguen exigiendo — acá el
    // gate server-side vivía SOLO en el schema propio de /abonados/nuevo
    // (nuevo/actions.ts), pero Turno fijo llama a ESTA MISMA action
    // (createAbonadoAction) directo, sin pasar por ahí, así que quedaba
    // enforced nada más que en la UI (revisión amarilla). El `refine` de abajo
    // lo exige acá también, salvo que venga marcado `viaWeeklyEvent`.
    contactPhone: boundedText(40).min(1, 'Ingresá un teléfono de contacto').optional(),
    // Único camino con teléfono realmente opcional: el evento semanal de la
    // grilla (EventoForm). Turno fijo y /abonados/nuevo nunca lo mandan, así
    // que por default el teléfono sigue siendo obligatorio server-side.
    viaWeeklyEvent: z.boolean().optional(),
    dayOfWeek: z.number().int().min(0, 'Elegí un día válido').max(6, 'Elegí un día válido'),
    timeStart: hhmm,
    timeEnd: hhmmEnd,
    pricePerSession: moneyCents,
    startsOn: dateStr,
    endsOn: dateStr.optional(),
    paymentMethod: z.enum(['cash', 'transfer']).optional(),
  })
  .refine((data) => data.viaWeeklyEvent === true || !!data.contactPhone, {
    message: 'Ingresá un teléfono de contacto',
    path: ['contactPhone'],
  })
