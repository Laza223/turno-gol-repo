import { z } from 'zod'

/**
 * La clave de un contacto sin cuenta, tal como la emite `listTenantClients`:
 * el teléfono normalizado (6 a 10 dígitos) o `id:<uuid>` cuando el teléfono no
 * llegaba al mínimo de dígitos para afirmar identidad.
 *
 * Se valida acá y no solo en la query porque llega del cliente: sin este
 * formato cerrado, un string arbitrario entraría al `WHERE` como comparación
 * de texto contra el teléfono normalizado. No es inyección (va parametrizado)
 * pero sí es una forma de sondear qué teléfonos existen en el complejo.
 */
const contactKeySchema = z
  .string()
  .regex(/^(id:[0-9a-fA-F-]{36}|\d{6,10})$/, 'Contacto inválido.')

export const linkContactInputSchema = z.object({
  contactKey: contactKeySchema,
  playerId: z.guid('ID de jugador inválido.'),
})
