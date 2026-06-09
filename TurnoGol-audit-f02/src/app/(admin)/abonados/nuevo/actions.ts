'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createAbonadoAction } from '../actions'
import type { CreateAbonadoInput } from '@/modules/abonados/abonado.types'

const schema = z.object({
  courtId: z.string().uuid('Elegí una cancha'),
  contactName: z.string().trim().min(1, 'Nombre requerido'),
  contactPhone: z.string().trim().min(1, 'Teléfono requerido'),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/, 'Horario inválido'),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Horario inválido'),
  pricePerSession: z.coerce.number().positive('El precio por sesión es requerido'),
  monthlyPrice: z.coerce.number().positive('El precio mensual es requerido'),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  paymentMethod: z.enum(['cash', 'transfer']).default('cash'),
  notes: z.string().trim().max(1000).optional(),
})

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
