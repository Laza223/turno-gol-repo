import { z } from 'zod'

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

const openingHoursDaySchema = z.object({
  open: z.string().regex(timePattern, 'Formato HH:MM requerido'),
  close: z.string().regex(timePattern, 'Formato HH:MM requerido'),
  closed: z.boolean().optional(),
})

export const openingHoursSchema = z.object({
  mon: openingHoursDaySchema,
  tue: openingHoursDaySchema,
  wed: openingHoursDaySchema,
  thu: openingHoursDaySchema,
  fri: openingHoursDaySchema,
  sat: openingHoursDaySchema,
  sun: openingHoursDaySchema,
})

export const createTenantSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres').max(100),
  address: z.string().min(5, 'Dirección muy corta').max(200),
  city: z.string().min(2).max(100),
  province: z.string().min(2).max(100),
  phone: z.string().min(8, 'Teléfono inválido').max(25),
  email: z.string().email('Email inválido'),
})

