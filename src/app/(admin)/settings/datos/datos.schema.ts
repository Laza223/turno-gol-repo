import { z } from 'zod'

/**
 * Cursor keyset `(starts_at, id)` de la última reserva entregada, tal como lo
 * emite `listBookingsForExport`. El instante va en ISO UTC con microsegundos
 * (`to_char`, no `::text`): así no depende del `TimeZone` de la sesión y vuelve
 * a Postgres sin perder precisión, que es lo que garantiza que el borde entre
 * páginas no repita ni saltee una fila.
 */
const CURSOR_RE =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/**
 * Llega del cliente, así que se valida entero. La vuelta por `Date` descarta
 * un día que no existe (`2026-02-31`): JS lo corre al 3 de marzo sin avisar y
 * Postgres lo rechaza con una excepción en vez de un `{ success: false }`.
 */
const bookingsCursorSchema = z
  .string()
  .regex(CURSOR_RE)
  .transform((cursor) => {
    const [, startsAt = '', id = ''] = CURSOR_RE.exec(cursor) ?? []
    return { startsAt, id }
  })
  .refine(({ startsAt }) => {
    const ms = Date.parse(startsAt)
    return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 19) === startsAt.slice(0, 19)
  })

/** `null` si el cursor no tiene la forma que emite la query de reservas. */
export function parseBookingsCursor(cursor: unknown): { startsAt: string; id: string } | null {
  const parsed = bookingsCursorSchema.safeParse(cursor)
  return parsed.success ? parsed.data : null
}
