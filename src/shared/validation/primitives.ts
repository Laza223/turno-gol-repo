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
export const boundedText = (max: number) => z.string().max(max)
export const slug = z.string().regex(SLUG_RE, 'slug inválido')
