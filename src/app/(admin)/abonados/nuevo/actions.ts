'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createAbonadoAction } from '../actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { generateSlotDates } from '@/modules/abonados/slot-generator'
import {
  checkAbonadoSlotConflict,
  getAbonadoSlotConflicts,
} from '@/modules/abonados/abonado.service'
import type { CreateAbonadoInput } from '@/modules/abonados/abonado.types'

// #33: comparamos timeEnd > timeStart en segundos del dia. Acepta HH:MM y
// HH:MM:SS (la comparacion lexicografica fallaria al mezclar ambos formatos).
function timeToSeconds(t: string): number {
  const [h, m, s] = t.split(':').map(Number)
  return h * 3600 + m * 60 + (s ?? 0)
}

const TIME_RANGE_MSG = 'El horario de fin debe ser posterior al de inicio.'
const endAfterStart = (d: { timeStart: string; timeEnd: string }): boolean =>
  timeToSeconds(d.timeEnd) > timeToSeconds(d.timeStart)

const schema = z
  .object({
    courtId: z.guid('Elegí una cancha'),
    contactName: z.string().trim().min(1, 'Nombre requerido'),
    contactPhone: z.string().trim().min(1, 'Teléfono requerido'),
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    // Accept HH:MM (form input) AND HH:MM:SS (DB value passed back by the
    // reactivate dialog, which renders the abonado row's stored time directly).
    timeStart: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/, 'Horario inválido'),
    timeEnd: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/, 'Horario inválido'),
    // El cliente (AbonadoForm/MoneyInput) ya manda CENTAVOS en este campo, no
    // pesos — z.coerce.number() porque FormData siempre entrega strings. El
    // parser dual pesos-string + Math.round(*100) que había acá antes era el
    // bug de auditoría §4.4 ("$25" en vez de "$25.000" via Number("25.000") === 25).
    pricePerSessionCents: z.coerce.number().int().positive('El precio por sesión es requerido'),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
    paymentMethod: z.enum(['cash', 'transfer']).default('cash'),
  })
  .refine(endAfterStart, { message: TIME_RANGE_MSG, path: ['timeEnd'] })

const previewSchema = z
  .object({
    courtId: z.guid('Elegí una cancha'),
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
  .refine(endAfterStart, { message: TIME_RANGE_MSG, path: ['timeEnd'] })

export type PreviewAbonadoSlotsInput = z.infer<typeof previewSchema>

export type PreviewAbonadoSlotsResult =
  { success: true; dates: string[]; conflicts: string[] } | { success: false; error: string }

export async function previewAbonadoSlotsAction(
  input: PreviewAbonadoSlotsInput,
): Promise<PreviewAbonadoSlotsResult> {
  const parsed = previewSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  // B10 — mismo guard que `createAbonadoAction`, que es lo que este preview
  // antecede. Antes autenticaba a mano, y una Server Action que autentica a mano
  // NO hereda nada del layout de `(admin)` (ver el hallazgo R2 en guards.ts): se
  // quedaba sin el chequeo de lifecycle del tenant, así que un complejo
  // `blocked` por falta de pago seguía pudiendo consultar disponibilidad.
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

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

  const result = await withTenantContext(tenant.id, async (tx) => {
    // #34: el preview tambien debe detectar un abonado ACTIVO en el mismo
    // court/dia/horario (getAbonadoSlotConflicts solo mira bookings). Sin esto
    // el choque recien explotaba al confirmar (createAbonado lanza
    // AbonadoConflictError) en vez de avisarse en la vista previa.
    const abonadoConflict = await checkAbonadoSlotConflict(
      courtId,
      dayOfWeek,
      timeStart,
      timeEnd,
      tenant.id,
      null,
      tx,
    )
    if (abonadoConflict) return { abonadoConflict: true as const }
    const conflicts = await getAbonadoSlotConflicts(
      tenant.id,
      courtId,
      timeStart,
      timeEnd,
      dates,
      tx,
    )
    return { abonadoConflict: false as const, conflicts }
  })

  if (result.abonadoConflict) {
    // Mismo mensaje que AbonadoConflictError (la barrera del create path).
    return { success: false, error: 'Ya existe un turno fijo activo en ese horario.' }
  }

  return { success: true, dates, conflicts: result.conflicts }
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
    // Ya viene en centavos (ver el comentario del schema) — CreateAbonadoInput
    // usa `pricePerSession` como nombre de campo, pero su unidad es centavos.
    pricePerSession: d.pricePerSessionCents,
    startsOn: d.startsOn,
    paymentMethod: d.paymentMethod,
  }

  const result = await createAbonadoAction(input)
  if (!result.success) return { status: 'error', message: result.error }
  redirect('/abonados')
}
