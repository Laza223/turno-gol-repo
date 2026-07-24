import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { DayAlreadyClosedError, OpenDateInFutureError } from './cashflow.errors'
import { operatingDateOf } from '@/shared/time/operating-day'
import type { DailyCashOpenRow } from './cashflow.types'

/**
 * Apertura de caja (migración 049): fondo inicial en efectivo del día.
 * openDay es UPSERT a propósito — "abrir" y "corregir el fondo" son la misma
 * acción para el usuario (editable mientras el día siga abierto). El guard
 * corre bajo el MISMO advisory lock que assertDayOpen/closeDailyRegister:
 * no se puede abrir/editar un día que ya cerró, ni colarse en el medio de
 * un cierre en curso.
 */

type OpenRowRaw = {
  id: string
  tenant_id: string
  date: Date | string
  opening_cash: number
  note: string | null
  opened_by: string
  opened_at: Date | string
  updated_at: Date | string
}

function rowToOpen(r: OpenRowRaw): DailyCashOpenRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    // date llega como Date o string según el driver (gotcha del repo).
    date: new Date(r.date),
    openingCash: r.opening_cash,
    note: r.note,
    openedBy: r.opened_by,
    openedAt: new Date(r.opened_at),
    updatedAt: new Date(r.updated_at),
  }
}

export async function getDayOpen(
  tenantId: string,
  date: string,
  tx: DbTx,
): Promise<DailyCashOpenRow | null> {
  const rows = await tx.execute(sql`
    SELECT * FROM daily_cash_opens
    WHERE tenant_id = ${tenantId} AND date = ${date}::date
    LIMIT 1
  `)
  const row = (rows as unknown as OpenRowRaw[])[0]
  return row ? rowToOpen(row) : null
}

export async function openDay(
  tenantId: string,
  staffUserId: string,
  input: { date: string; openingCash: number; note?: string | null },
  cutoffMins: number,
  tx: DbTx,
): Promise<DailyCashOpenRow> {
  if (input.date > operatingDateOf(new Date(), cutoffMins)) throw new OpenDateInFutureError(input.date)

  const lockKey = `daily_close:${tenantId}`
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`)

  const closeCheck = await tx.execute(sql`
    SELECT id FROM daily_cash_closes
    WHERE tenant_id = ${tenantId} AND date = ${input.date}::date
    LIMIT 1
  `)
  if ((closeCheck as unknown[]).length > 0) {
    throw new DayAlreadyClosedError(input.date)
  }

  // Valor previo ANTES del upsert: el UPSERT pisa opening_cash sin historial
  // propio, así que la trazabilidad de "quién corrigió el fondo y desde qué
  // valor" vive en audit_logs (hallazgo del panel de Fase 5; mismo criterio
  // que el audit del cierre).
  const prevRows = await tx.execute(sql`
    SELECT opening_cash FROM daily_cash_opens
    WHERE tenant_id = ${tenantId} AND date = ${input.date}::date
    LIMIT 1
  `)
  const previousOpeningCash =
    (prevRows as unknown as Array<{ opening_cash: number }>)[0]?.opening_cash ?? null

  const rows = await tx.execute(sql`
    INSERT INTO daily_cash_opens (tenant_id, date, opening_cash, note, opened_by)
    VALUES (${tenantId}, ${input.date}::date, ${input.openingCash}, ${input.note ?? null}, ${staffUserId})
    ON CONFLICT (tenant_id, date) DO UPDATE
      SET opening_cash = EXCLUDED.opening_cash,
          note = EXCLUDED.note
    RETURNING *
  `)
  const row = rowToOpen((rows as unknown as OpenRowRaw[])[0]!)

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: previousOpeningCash === null ? 'cashflow.day_opened' : 'cashflow.open_corrected',
    resourceType: 'daily_cash_open',
    resourceId: row.id,
    metadata: { date: input.date, openingCash: input.openingCash, previousOpeningCash },
  })

  return row
}
