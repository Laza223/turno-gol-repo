import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import type { BookingStatus, BookingType } from '@/modules/bookings/booking.types'
import { getAbonados } from '@/modules/abonados/abonado.service'
import { listCourts } from '@/modules/courts/court.service'
import { sumBookingChargesByBooking } from '@/app/(admin)/reservas/queries'
import { CLIENTES_PAGE_SIZE, listTenantClients } from '@/app/(admin)/jugadores/queries'
import type {
  AbonadoExportSource,
  BookingExportSource,
  ClientExportSource,
} from '@/modules/reports/data-export'

/**
 * Lecturas del export de datos del complejo (`/settings/datos`). Reusan los
 * helpers de las pantallas que muestran lo mismo —`/reservas`, `/abonados`,
 * `/jugadores`— para que el archivo no pueda contradecir al panel.
 */

/**
 * Reservas por llamada. Con ~200 bytes por fila son unos 400 KB, lejos del
 * techo de respuesta de una función de Vercel, y `sumBookingChargesByBooking`
 * arma 2 parámetros por reserva: 4.000, lejos de los 65.535 de postgres-js.
 */
export const BOOKINGS_EXPORT_PAGE_SIZE = 2000

export type BookingsExportPage = {
  rows: BookingExportSource[]
  /** `null` cuando esta fue la última página. */
  nextCursor: string | null
}

/**
 * Una página de reservas en orden cronológico, desde la primera del historial
 * hasta la última agendada.
 *
 * Keyset y no OFFSET: el export corre en varias llamadas y entre una y otra
 * puede entrar una reserva. Con OFFSET esa reserva corre el borde y una fila se
 * repite o se pierde; con el cursor, cada fila sale una sola vez.
 *
 * Cliente y teléfono son el mismo criterio de la Agenda (`COALESCE(guest_phone,
 * players.phone)`), más el titular del turno fijo para las reservas de un
 * abonado sin cuenta.
 */
export async function listBookingsForExport(
  tenantId: string,
  after: { startsAt: string; id: string } | null,
  tx: DbTx,
): Promise<BookingsExportPage> {
  const rows = (await tx.execute(sql`
    SELECT b.id,
           b.date::text AS date,
           b.time_start::text AS "timeStart",
           b.time_end::text AS "timeEnd",
           c.name AS "courtName",
           b.type,
           b.status,
           (b.whatsapp_chat_id IS NOT NULL) AS "viaWhatsapp",
           (b.created_by_staff IS NOT NULL) AS "byStaff",
           COALESCE(
             CASE WHEN p.id IS NULL THEN NULL ELSE p.first_name || ' ' || p.last_name END,
             b.guest_name,
             a.contact_name
           ) AS "clientName",
           COALESCE(b.guest_phone, p.phone, a.contact_phone) AS phone,
           b.price_snapshot AS "priceSnapshot",
           b.deposit_amount AS "depositAmount",
           b.deposit_status AS "depositStatus",
           to_char(b.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "startsAtKey"
    FROM bookings b
    JOIN courts c ON c.id = b.court_id AND c.tenant_id = b.tenant_id
    LEFT JOIN players p ON p.id = b.player_id
    LEFT JOIN abonados a ON a.id = b.abonado_id AND a.tenant_id = b.tenant_id
    WHERE b.tenant_id = ${tenantId}
      ${after ? sql`AND (b.starts_at, b.id) > (${after.startsAt}::timestamptz, ${after.id}::uuid)` : sql``}
    ORDER BY b.starts_at, b.id
    LIMIT ${BOOKINGS_EXPORT_PAGE_SIZE}
  `)) as unknown as Array<Omit<BookingExportSource, 'totalPaid'> & { startsAtKey: string }>

  const charges = await sumBookingChargesByBooking(
    tenantId,
    rows.map((r) => r.id),
    tx,
  )

  const last = rows.at(-1)
  return {
    rows: rows.map(({ startsAtKey: _key, ...r }) => ({
      ...r,
      type: r.type as BookingType,
      status: r.status as BookingStatus,
      totalPaid: summarizeBookingCharges({
        priceSnapshot: r.priceSnapshot,
        depositAmount: r.depositAmount,
        depositStatus: r.depositStatus,
        chargesTotal: charges.get(r.id)?.total ?? 0,
      }).totalPaid,
    })),
    nextCursor:
      last && rows.length === BOOKINGS_EXPORT_PAGE_SIZE ? `${last.startsAtKey}|${last.id}` : null,
  }
}

/** Todos los turnos fijos, en cualquier estado, con el nombre de su cancha. */
export async function listAbonadosForExport(
  tenantId: string,
  tx: DbTx,
): Promise<AbonadoExportSource[]> {
  // En serie: las dos van por la misma conexión de la transacción.
  const abonados = await getAbonados(tenantId, {}, tx)
  const courts = await listCourts(tenantId, tx)
  const courtName = new Map(courts.map((c) => [c.id, c.name]))
  return abonados.map((a) => ({ ...a, courtName: courtName.get(a.courtId) ?? '' }))
}

/**
 * Todas las personas de `/jugadores`, recorriendo `listTenantClients` página
 * por página en la misma transacción. Se reusa sin tocarla: copiar sus CTEs
 * sería una segunda definición de "cliente" que diverge en silencio.
 *
 * Su paginación es por OFFSET ordenado por última reserva, y cada página es
 * una lectura aparte. Si un cliente de una página que todavía no se leyó
 * reserva mientras se recorre, sube a una que ya se leyó: esa vuelta no lo ve,
 * y la fila que cruza el borde sale dos veces. El `Map` por `key` deja la
 * repetida en una, y el `total` que trae cada página delata al que faltó: ahí
 * se recorre de nuevo desde cero. Cada vuelta arranca con el `Map` vacío
 * porque la clave de una persona sin cuenta es su teléfono: si se edita entre
 * vueltas, la clave vieja sumada a la nueva la sacaría dos veces. Un archivo
 * con un cliente de menos o de más no se entrega nunca.
 */
export async function listClientsForExport(
  tenantId: string,
  tx: DbTx,
): Promise<ClientExportSource[]> {
  for (let pass = 0; pass < CLIENTS_EXPORT_MAX_PASSES; pass++) {
    const byKey = new Map<string, ClientExportSource>()
    let total = 0
    for (let page = 0; ; page++) {
      const { rows, total: pageTotal } = await listTenantClients(tenantId, {}, tx, page)
      for (const r of rows) byKey.set(r.key, r)
      // Una página vacía trae total 0: vale el de la última que trajo filas.
      if (rows.length > 0) total = pageTotal
      if (rows.length < CLIENTES_PAGE_SIZE) break
    }
    if (byKey.size === total) return [...byKey.values()]
  }
  throw new Error('La lista de clientes cambió mientras se exportaba')
}

/** Vueltas antes de rendirse: que un cliente se mueva en tres seguidas no pasa. */
const CLIENTS_EXPORT_MAX_PASSES = 3
