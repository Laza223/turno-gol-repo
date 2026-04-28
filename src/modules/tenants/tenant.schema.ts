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

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  address: z.string().min(5).max(200).optional(),
  city: z.string().min(2).max(100).optional(),
  province: z.string().min(2).max(100).optional(),
  phone: z.string().min(8).max(25).optional(),
  whatsapp: z.string().min(8).max(25).nullable().optional(),
  email: z.string().email().optional(),
  openingHours: openingHoursSchema.optional(),
  closedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD')).optional(),
})

export const updateTenantSettingsSchema = z.object({
  requires_deposit: z.boolean().optional(),
  deposit_percentage: z.number().int().min(0).max(100).optional(),
  cancellation_policy: z
    .object({
      hours_before: z.number().int().min(0),
      penalty_type: z.enum(['deposit', 'full']),
      penalty_amount: z.number().int().nullable(),
    })
    .optional(),
  accepts_cash: z.boolean().optional(),
  accepts_transfer: z.boolean().optional(),
  accepts_mercadopago: z.boolean().optional(),
  allow_online_booking: z.boolean().optional(),
  booking_advance_days: z.number().int().min(1).max(30).optional(),
  auto_complete_minutes: z.number().int().min(0).max(120).optional(),
})
