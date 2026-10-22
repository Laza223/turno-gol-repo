'use server'

import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext, type DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import type { ActionResult } from '@/shared/types/action-result'
import {
  ABONADOS_EXPORT_HEADER,
  BOOKINGS_EXPORT_HEADER,
  CLIENTS_EXPORT_HEADER,
  abonadoExportRow,
  bookingExportRow,
  clientExportRow,
  csvBody,
} from '@/modules/reports/data-export'
import { listAbonadosForExport, listBookingsForExport, listClientsForExport } from './queries'
import { parseBookingsCursor } from './datos.schema'

/**
 * Un pedazo del archivo: el encabezado y las líneas ya escapadas. Las reservas
 * vienen en varios pedazos (`nextCursor`); fijos y clientes, en uno solo.
 */
type DataExportChunk = {
  header: string
  body: string
  rows: number
  nextCursor: string | null
}

export type DataExportResult = ActionResult<DataExportChunk>

type Dataset = 'bookings' | 'abonados' | 'clients'

/**
 * Guard → rate limit → lectura + audit en la MISMA transacción, para los tres
 * archivos. Si el audit no se puede escribir, el dato no sale.
 *
 * Solo el dueño (spec §6.1): `requireAdminStaffAction` además rebota a un
 * complejo bloqueado (§6.3) igual que el resto de las acciones del panel. En
 * solo lectura (`suspended`, decisión 2026-10-22) exportar sí se puede: es
 * leer sus propios datos, y pasa por `allowReadOnly`.
 */
async function runExport(
  dataset: Dataset,
  read: (tenantId: string, tx: DbTx) => Promise<Omit<DataExportChunk, 'header'>>,
  header: string,
  auditExtra: Record<string, unknown> = {},
): Promise<DataExportResult> {
  const auth = await requireAdminStaffAction({ allowReadOnly: true })
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant, user } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const chunk = await withTenantContext(tenant.id, async (tx) => {
    const result = await read(tenant.id, tx)
    await insertAuditLog(tx, {
      tenantId: tenant.id,
      actorId: user.staffUserId,
      actorType: 'staff',
      action: 'tenant.data_exported',
      resourceType: 'tenant',
      resourceId: tenant.id,
      metadata: { dataset, rows: result.rows, ...auditExtra },
    })
    return result
  })

  return { success: true, header, ...chunk }
}

/**
 * Reservas, de a una página por llamada (`BOOKINGS_EXPORT_PAGE_SIZE`). El
 * cliente llama de nuevo con `nextCursor` hasta recibir `null`.
 */
export async function exportBookingsAction(cursor: string | null): Promise<DataExportResult> {
  const after = cursor === null ? null : parseBookingsCursor(cursor)
  if (cursor !== null && after === null) {
    return { success: false, error: 'No se pudo seguir con la descarga. Probá de nuevo.' }
  }
  return runExport(
    'bookings',
    async (tenantId, tx) => {
      const page = await listBookingsForExport(tenantId, after, tx)
      return {
        body: csvBody(page.rows.map(bookingExportRow)),
        rows: page.rows.length,
        nextCursor: page.nextCursor,
      }
    },
    BOOKINGS_EXPORT_HEADER,
    { cursor },
  )
}

export async function exportAbonadosAction(): Promise<DataExportResult> {
  return runExport(
    'abonados',
    async (tenantId, tx) => {
      const rows = await listAbonadosForExport(tenantId, tx)
      return { body: csvBody(rows.map(abonadoExportRow)), rows: rows.length, nextCursor: null }
    },
    ABONADOS_EXPORT_HEADER,
  )
}

export async function exportClientsAction(): Promise<DataExportResult> {
  return runExport(
    'clients',
    async (tenantId, tx) => {
      const rows = await listClientsForExport(tenantId, tx)
      return { body: csvBody(rows.map(clientExportRow)), rows: rows.length, nextCursor: null }
    },
    CLIENTS_EXPORT_HEADER,
  )
}
