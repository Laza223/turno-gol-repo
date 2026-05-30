'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createAbonadoAction } from '../actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { generateSlotDates } from '@/modules/abonados/slot-generator'
import { getAbonadoSlotConflicts } from '@/modules/abonados/abonado.service'
import type { CreateAbonadoInput } from '@/modules/abonados/abonado.types'

const schema = z.object({
  courtId: z.string().uuid('Elegí una cancha'),
  contactName: z.string().trim().min(1, 'Nombre requerido'),
  contactPhone: z.string().trim().min(1, 'Teléfono requerido'),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  // Accept HH:MM (form input) AND HH:MM:SS (DB value passed back by the
  // reactivate dialog, which renders the abonado row's stored time directly).
  timeStart: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/, 'Horario inválido'),
  timeEnd: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/, 'Horario inválido'),
  pricePerSession: z.coerce.number().positive('El precio por sesión es requerido'),
  monthlyPrice: z.coerce.number().positive('El precio mensual es requerido'),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  paymentMethod: z.enum(['cash', 'transfer']).default('cash'),
  notes: z.string().trim().max(1000).optional(),
})

const previewSchema = z.object({
  courtId: z.string().uuid('Elegí una cancha'),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  // Accept HH:MM (form input) AND HH:MM:SS (DB value passed back by the
  // reactivate dialog, which renders the abonado row's stored time directly).
  timeStart: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/, 'Horario inválido'),
  timeEnd: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/, 'Horario inválido'),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  endsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
    .optional(),
})

export type PreviewAbonadoSlotsInput = z.infer<typeof previewSchema>

export type PreviewAbonadoSlotsResult =
  | { success: true; dates: string[]; conflicts: string[] }
  | { success: false; error: string }

export async function previewAbonadoSlotsAction(
  input: PreviewAbonadoSlotsInput,
): Promise<PreviewAbonadoSlotsResult> {
  const parsed = previewSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const { courtId, dayOfWeek, timeStart, timeEnd, startsOn, endsOn } = parsed.data

  const closedDates = (tenant.closedDates ?? []) as string[]
  const dates = generateSlotDates({
    dayOfWeek,
    startsOn,
    endsOn: endsOn ?? null,
    fromDate: startsOn,
    count: 8,
    closedDates,
  })

  const conflicts = await withTenantContext(tenant.id, (tx) =>
    getAbonadoSlotConflicts(tenant.id, courtId, timeStart, timeEnd, dates, tx),
  )

  return { success: true, dates, conflicts }
}

export type NewAbonadoState = { status: 'idle' } | { status: 'error'; message: string }

export async function submitNewAbonado(
  _prev: NewAbonadoState,
  formData: FormData,
): Promise<NewAbonadoState> {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  const d = parsed.data
  const input: CreateAbonadoInput = {
    courtId: d.courtId,
    contactName: d.contactName,
    contactPhone: d.contactPhone,
    dayOfWeek: d.dayOfWeek,
    timeStart: d.timeStart,
    timeEnd: d.timeEnd,
    pricePerSession: Math.round(d.pricePerSession * 100),
    monthlyPrice: Math.round(d.monthlyPrice * 100),
    startsOn: d.startsOn,
    paymentMethod: d.paymentMethod,
    notes: d.notes,
  }

  const result = await createAbonadoAction(input)
  if (!result.success) return { status: 'error', message: result.error }
  redirect('/abonados')
}
