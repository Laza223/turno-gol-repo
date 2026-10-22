'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dateStr } from '@/shared/validation/primitives'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { todayART } from '@/shared/time/art-date'
import { importAbonados, previewAbonadoImport } from '@/modules/abonados/abonado-import.service'
import type { ImportOutcome, ImportPreview } from '@/modules/abonados/abonado-import.types'

// 200 filas de planilla entran holgadas: esto corta el pegado accidental de un
// archivo entero antes de parsearlo.
const MAX_TEXT_LENGTH = 200_000

// Mismo piso que el alta manual (nuevo/actions.ts): un fijo son reservas a
// futuro, y una fecha pasada generaba partidos "jugados" que nunca ocurrieron.
const inputSchema = z.object({
  text: z.string().max(MAX_TEXT_LENGTH, 'La planilla es demasiado larga. Cargala en partes.'),
  startsFrom: dateStr.refine(
    (d) => d >= todayART(),
    'La fecha de inicio no puede ser anterior a hoy.',
  ),
})

export type ImportAbonadosInput = z.infer<typeof inputSchema>

/** Revisar: cada fila con lo que va a pasar. No escribe nada. */
export async function previewAbonadoImportAction(
  input: ImportAbonadosInput,
): Promise<ImportPreview> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  // Mismo guard que el alta manual: dueño y encargado.
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { ok: false, error: limited }

  return withTenantContext(tenant.id, (tx) =>
    previewAbonadoImport(tenant.id, parsed.data.text, parsed.data.startsFrom, tx),
  )
}

/**
 * Cargar: crea los fijos de las filas buenas, con sus turnos, por el mismo
 * `createAbonado` del alta manual. Vuelve a validar todo del lado del servidor:
 * el cliente solo manda el texto y la fecha.
 */
export async function importAbonadosAction(input: ImportAbonadosInput): Promise<ImportOutcome> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { ok: false, error: limited }

  let outcome: ImportOutcome | undefined
  try {
    // Una transacción por fila: ver `importAbonados`.
    outcome = await importAbonados(
      tenant.id,
      user.staffUserId!,
      parsed.data.text,
      parsed.data.startsFrom,
      (fn) => withTenantContext(tenant.id, fn),
    )
    return outcome
  } finally {
    // Sin `outcome` el lote se cortó a la mitad, y lo que entró antes ya está
    // confirmado: las listas lo tienen que mostrar igual.
    if (!outcome || (outcome.ok && outcome.created.length > 0)) {
      revalidatePath('/abonados')
      revalidatePath('/grilla')
      // Los contactos de los fijos sin cuenta son personas de /jugadores.
      revalidatePath('/jugadores')
    }
  }
}
