'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { uuid, dateStr } from '@/shared/validation/primitives'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { enforce } from '@/shared/rate-limit/apply'
import { createAbonado, reactivateAbonado, cancelAbonado } from '@/modules/abonados/abonado.service'
import { previewUpdateAbonado, updateAbonado } from '@/modules/abonados/abonado.update'
import { createAbonadoSchema, updateAbonadoSchema } from '@/modules/abonados/abonado.schema'
import {
  AbonadoConflictError,
  AbonadoMoveConflictError,
  AbonadoNotEditableError,
  AbonadoNotFoundError,
  AbonadoAlreadyCanceledError,
  ReactivationConflictError,
  CourtNotFoundError,
  PlayerNotClientError,
} from '@/modules/abonados/abonado.errors'
import type {
  AbonadoRow,
  CreateAbonadoInput,
  UpdateAbonadoCounts,
  UpdateAbonadoPreview,
} from '@/modules/abonados/abonado.types'
import {
  searchTenantPlayers,
  type PlayerSearchResult,
} from '@/modules/players/player-search.service'

export type AbonadoActionResult =
  | {
      success: true
      abonado: AbonadoRow
      slotsGenerated?: number
      conflictDates?: string[]
      /** Cancelar: fechas con plata cargada que NO se borraron. */
      keptDates?: string[]
    }
  | { success: false; error: string }

export async function createAbonadoAction(input: CreateAbonadoInput): Promise<AbonadoActionResult> {
  const parsed = createAbonadoSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Revisá los datos del turno fijo.' }
  }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  // Regla de la clase (rediseño Caja/Cantina): el catch va FUERA del contexto
  // transaccional — atrapar adentro y devolver un objeto commitea lo escrito
  // antes del throw. Acá los services tiran antes de escribir, pero el patrón
  // uniforme evita que un refactor futuro herede la mina.
  let created: { abonado: AbonadoRow; slotsGenerated: number; conflictDates: string[] }
  try {
    created = await withTenantContext(tenant.id, (tx) =>
      createAbonado(tenant.id, user.staffUserId!, parsed.data, tx),
    )
  } catch (err) {
    if (err instanceof AbonadoConflictError) {
      return { success: false, error: err.message }
    }
    if (err instanceof CourtNotFoundError) {
      return { success: false, error: 'No encontramos esa cancha.' }
    }
    if (err instanceof PlayerNotClientError) {
      return { success: false, error: err.message }
    }
    throw err
  }

  revalidatePath('/abonados')
  // El evento semanal se crea desde el modal de la grilla (EventoForm) y sus
  // sesiones tienen que aparecer ahí sin esperar el revalidate de /abonados.
  revalidatePath('/grilla')
  return {
    success: true,
    abonado: created.abonado,
    slotsGenerated: created.slotsGenerated,
    conflictDates: created.conflictDates,
  }
}

export async function reactivateAbonadoAction(id: string): Promise<AbonadoActionResult> {
  const parsedId = uuid.safeParse(id)
  if (!parsedId.success) return { success: false, error: 'ID inválido.' }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let reactivated: { abonado: AbonadoRow; slotsGenerated: number }
  try {
    reactivated = await withTenantContext(tenant.id, (tx) =>
      reactivateAbonado(tenant.id, parsedId.data, user.staffUserId!, tx),
    )
  } catch (err) {
    if (
      err instanceof AbonadoNotFoundError ||
      err instanceof AbonadoAlreadyCanceledError ||
      err instanceof ReactivationConflictError
    ) {
      return { success: false, error: (err as Error).message }
    }
    throw err
  }

  revalidatePath('/abonados')
  return {
    success: true,
    abonado: reactivated.abonado,
    slotsGenerated: reactivated.slotsGenerated,
  }
}

export async function cancelAbonadoAction(
  id: string,
  fromDate: string,
): Promise<AbonadoActionResult> {
  const parsed = z.object({ id: uuid, fromDate: dateStr }).safeParse({ id, fromDate })
  if (!parsed.success) return { success: false, error: 'Revisá la fecha elegida.' }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let canceled: { abonado: AbonadoRow; keptDates: string[] }
  try {
    canceled = await withTenantContext(tenant.id, (tx) =>
      cancelAbonado(tenant.id, parsed.data.id, parsed.data.fromDate, user.staffUserId!, tx),
    )
  } catch (err) {
    if (err instanceof AbonadoNotFoundError || err instanceof AbonadoAlreadyCanceledError) {
      return { success: false, error: (err as Error).message }
    }
    throw err
  }

  revalidatePath('/abonados')
  // Las sesiones borradas salen de la grilla; las que se conservaron también cambian.
  revalidatePath('/grilla')
  return { success: true, abonado: canceled.abonado, keptDates: canceled.keptDates }
}

const updateAbonadoRequestSchema = z.object({ id: uuid, changes: updateAbonadoSchema })

export type UpdateAbonadoActionResult =
  | { success: true; abonado: AbonadoRow; counts: UpdateAbonadoCounts }
  | { success: false; error: string; conflictDates?: string[]; fixedConflict?: boolean }

export type PreviewUpdateAbonadoActionResult =
  { success: true; preview: UpdateAbonadoPreview } | { success: false; error: string }

/** Errores de dominio de editar un turno fijo, con el texto que ve el encargado. */
function updateAbonadoErrorMessage(err: unknown): string | null {
  if (err instanceof AbonadoNotFoundError) return 'No encontramos ese turno fijo.'
  if (err instanceof AbonadoAlreadyCanceledError) return 'Ese turno fijo ya estaba cancelado.'
  if (err instanceof CourtNotFoundError) return 'No encontramos esa cancha.'
  if (
    err instanceof AbonadoNotEditableError ||
    err instanceof AbonadoConflictError ||
    err instanceof AbonadoMoveConflictError
  ) {
    return err.message
  }
  return null
}

/**
 * Editar un turno fijo en TODAS sus fechas futuras (spec 2026-11-08). El `catch`
 * va FUERA del contexto transaccional: atrapar adentro y devolver un objeto
 * commitearía lo escrito antes del throw.
 */
export async function updateAbonadoAction(
  id: string,
  changes: unknown,
): Promise<UpdateAbonadoActionResult> {
  const parsed = updateAbonadoRequestSchema.safeParse({ id, changes })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Revisá los datos del turno fijo.',
    }
  }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let outcome: Awaited<ReturnType<typeof updateAbonado>>
  try {
    outcome = await withTenantContext(tenant.id, (tx) =>
      updateAbonado(tenant.id, parsed.data.id, user.staffUserId!, parsed.data.changes, tx),
    )
  } catch (err) {
    const message = updateAbonadoErrorMessage(err)
    if (message === null) throw err
    return err instanceof AbonadoMoveConflictError
      ? {
          success: false,
          error: message,
          conflictDates: err.conflictDates,
          fixedConflict: err.fixedConflict,
        }
      : { success: false, error: message }
  }

  revalidatePath('/abonados')
  // Las fechas del fijo viven en la grilla: precio, nombre y horario cambian ahí.
  revalidatePath('/grilla')
  const { abonado, ...counts } = outcome
  return { success: true, abonado, counts }
}

/**
 * Vista previa de "Editar turno fijo": cuántas fechas cambian y cuáles chocan.
 * Balde propio (`adminAvailabilityCheck`): dispara mientras el encargado teclea
 * y compartir el límite de mutaciones lo dejaría sin cupo para guardar.
 */
export async function previewUpdateAbonadoAction(
  id: string,
  changes: unknown,
): Promise<PreviewUpdateAbonadoActionResult> {
  const parsed = updateAbonadoRequestSchema.safeParse({ id, changes })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Revisá los datos del turno fijo.',
    }
  }
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const outcome = await enforce('adminAvailabilityCheck', tenant.id)
  if (!outcome.ok) return { success: false, error: 'Demasiadas consultas. Esperá un momento.' }

  try {
    const preview = await withTenantContext(tenant.id, (tx) =>
      previewUpdateAbonado(tenant.id, parsed.data.id, parsed.data.changes, tx),
    )
    return { success: true, preview }
  } catch (err) {
    const message = updateAbonadoErrorMessage(err)
    if (message === null) throw err
    return { success: false, error: message }
  }
}

const searchAbonadoPlayersSchema = z.object({
  query: z.string().trim().max(120),
})

export type SearchAbonadoPlayersActionResult =
  { success: true; players: PlayerSearchResult[] } | { success: false; error: string }

/**
 * H124: mismo autocomplete de jugador registrado que ya tiene BookingFormModal
 * (searchTenantPlayers, `player-search.service.ts`) — acá para /abonados/nuevo,
 * que hasta ahora era un textbox pelado sin vínculo con la cuenta del jugador.
 * Balde propio (`adminAvailabilityCheck`, no `adminRateLimited`): dispara en
 * cada tecleo debounced, compartir el límite de mutaciones dejaría sin cupo a
 * crear/pausar/cancelar. Mismo razonamiento que `searchBookingPlayersAction`
 * en reservas/actions.ts.
 */
export async function searchAbonadoPlayersAction(
  input: unknown,
): Promise<SearchAbonadoPlayersActionResult> {
  const parsed = searchAbonadoPlayersSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const outcome = await enforce('adminAvailabilityCheck', tenant.id)
  if (!outcome.ok) {
    return { success: false, error: 'Demasiadas búsquedas. Esperá un momento.' }
  }

  const players = await withTenantContext(tenant.id, (tx) =>
    searchTenantPlayers(tenant.id, parsed.data.query, tx),
  )
  return { success: true, players }
}
