import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export const uuid = z.string().regex(UUID_RE, 'UUID inválido')
export const dateStr = z
  .string()
  .regex(DATE_RE, 'Formato YYYY-MM-DD requerido')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`)
    return !isNaN(d.getTime()) && d.toISOString().startsWith(s)
  }, 'Fecha de calendario inválida')
export const hhmm = z.string().regex(HHMM_RE, 'Formato HH:MM requerido')
export const moneyCents = z.number().int().nonnegative()
export const boundedText = (max: number) => z.string().max(max)
export const slug = z.string().regex(SLUG_RE, 'slug inválido')
