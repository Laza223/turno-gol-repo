import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
// El slot que termina exactamente a medianoche se guarda como '24:00' (TIME
// válido en Postgres, > '23:00' para las CHECK chk_time_valid/chk_abonado_time_valid)
// — solo válido como FIN, nunca como inicio. Mismo patrón que HHMM_END_RE en
// booking.schema.ts (ENS-12); acá vive el canónico para reusar sin duplicar.
const HHMM_END_RE = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

// Formato 8-4-4-4-12 a secas, sin chequear los nibbles de versión/variante —
// equivale a `z.guid()` de Zod 4 (y al `.uuid()` de Zod 3, que era igual de laxo).
// NO usar `z.uuid()`: en Zod 4 ese valida RFC 9562 y rechaza cosas que este regex
// acepta. Todas las PKs son `DEFAULT gen_random_uuid()` (v4), así que endurecerlo
// sería seguro — pero es una decisión de validación aparte, no algo que deba
// divergir sitio por sitio.
export const uuid = z.string().regex(UUID_RE, 'UUID inválido')

/**
 * Predicado suelto para las Server Components que reciben un id por la URL y lo
 * bindean a SQL crudo (`WHERE b.id = ${id}`): sin este guard, un id que no es
 * UUID hace fallar el cast en Postgres y la excepción se lleva puesta la página
 * entera en vez de dar el "no encontrado" (🔴 QA 2026-08-13, 4 rutas).
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
export const dateStr = z
  .string()
  .regex(DATE_RE, 'Formato YYYY-MM-DD requerido')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`)
    return !isNaN(d.getTime()) && d.toISOString().startsWith(s)
  }, 'Fecha de calendario inválida')
export const hhmm = z.string().regex(HHMM_RE, 'Formato HH:MM requerido')
// Variante para el FIN de un rango horario: además de HH:MM (00:00-23:59)
// acepta '24:00' (fin exacto a medianoche, ENS-13/ENS-12). No usar para inicio.
export const hhmmEnd = z.string().regex(HHMM_END_RE, 'Formato HH:MM requerido')
export const moneyCents = z.number().int().nonnegative()
// El mensaje va explícito y NO se delega en el locale global de Zod: medido en
// runtime (dev, Next 16 + Turbopack), `installZodLocale()` desde
// `instrumentation.ts` configura una copia de zod distinta de la que usan los
// schemas de la app — `globalThis.__zod_globalConfig.localeError` queda seteado
// y los mensajes de los schemas siguen saliendo en inglés igual. Ver el
// comentario de `zod-locale.ts`. Cualquier `.max()`/`.min()` que pueda llegar a
// la pantalla necesita su mensaje acá o en el schema.
export const boundedText = (max: number) => z.string().max(max, `Máximo ${max} caracteres`)
export const slug = z.string().regex(SLUG_RE, 'slug inválido')

// El `PhoneInput` manda el valor ya compuesto con el código de país
// (`"+54 11 3344-5566"`), así que cualquier regla que cuente CARACTERES de la
// cadena entera se come el prefijo como si fueran dígitos del abonado: con
// `min(8)` un número de 5 dígitos reales pasaba y quedaba guardado como
// "+54 12345" (🟡 QA 2026-08-13, en /register y en el paso 1 del onboarding).
// Se cuentan DÍGITOS: 10 como piso deja +54 con 8 dígitos nacionales (código de
// área + número, el mínimo que pide el checklist) y 15 como techo es el máximo
// de E.164.
const PHONE_SHAPE_RE = /^\+?[0-9][0-9\s-]*$/
export const phone = z
  .string()
  .trim()
  .regex(PHONE_SHAPE_RE, 'Ingresá un número de teléfono válido')
  .refine((v) => {
    const digits = v.replace(/\D/g, '')
    return digits.length >= 10 && digits.length <= 15
  }, 'Teléfono incompleto: poné el código de área y el número.')
