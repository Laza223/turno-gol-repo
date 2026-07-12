import { physicalRange } from '../../../src/shared/time/physical-range'

/**
 * Columnas de instante físico de un booking, derivadas del día operativo + horario.
 *
 * `bookings.starts_at` / `ends_at` son NOT NULL desde el refactor de instantes físicos:
 * la exclusion constraint de solapamiento trabaja sobre `tstzrange(starts_at, ends_at)`,
 * no sobre (date, time_start). Los seeds de e2e insertan con el service client de
 * Supabase, salteándose la capa de servicios, así que se quedaron sin esas columnas y
 * reventaban con:
 *
 *   null value in column "starts_at" of relation "bookings" violates not-null constraint
 *
 * El test moría SEMBRANDO sus datos —ni siquiera llegaba a probar nada— y dejaba la DB
 * sucia para los que venían después.
 *
 * Se usa el MISMO `physicalRange` que la app (`src/shared/time/physical-range.ts`, función
 * pura, sin imports) en vez de duplicar la conversión: si mañana cambia la regla de
 * timezone o de día operativo, los seeds la siguen solos.
 *
 * @param physicallyNextDay slots de madrugada de un complejo `closes_next_day`, archivados
 *   bajo el día operativo anterior. Los seeds de e2e usan horarios diurnos de un tenant
 *   normal, así que el default `false` es correcto para todos.
 */
export function bookingInstants(opts: {
  date: string // YYYY-MM-DD (día operativo)
  timeStart: string // HH:MM | HH:MM:SS
  timeEnd: string // HH:MM | HH:MM:SS | '24:00'
  physicallyNextDay?: boolean
}): { starts_at: string; ends_at: string } {
  const { startsAt, endsAt } = physicalRange({
    date: opts.date,
    timeStart: opts.timeStart,
    timeEnd: opts.timeEnd,
    physicallyNextDay: opts.physicallyNextDay ?? false,
  })
  return { starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() }
}
