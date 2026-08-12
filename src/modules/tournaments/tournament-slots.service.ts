import { sql } from 'drizzle-orm'
import { bookings } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { physicalRange } from '@/shared/time/physical-range'
import { hasActiveBookingOverlap } from '@/modules/bookings/booking.overlap'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import { expandRangeToHourSlots } from './slot-expansion'
import { NoSlotsReservedError, TournamentCourtUnavailableError } from './tournament.errors'
import type {
  ReserveSlotsInput,
  ReserveSlotsResult,
  SlotConflict,
  TournamentSlotRow,
} from './tournament.types'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function dayKeyOf(dateStr: string): (typeof DAY_KEYS)[number] {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return DAY_KEYS[new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1)).getUTCDay()]!
}

type TenantHours = { openingHours: OpeningHours; closesNextDay: boolean }

async function getTenantHours(tenantId: string, tx: DbTx): Promise<TenantHours> {
  const rows = (await tx.execute(sql`
    SELECT opening_hours AS "openingHours", closes_next_day AS "closesNextDay"
    FROM tenants
    WHERE id = ${tenantId}
    LIMIT 1
  `)) as unknown as TenantHours[]
  const row = rows[0]
  if (!row) throw new TournamentCourtUnavailableError(tenantId)
  return row
}

/**
 * Lockea TODAS las canchas pedidas de una, ordenadas por id.
 *
 * El orden estable es lo que evita el deadlock entre dos operaciones que toman
 * las mismas canchas en distinto orden (mismo patrón que canteen-sale.service).
 * El lock serializa el chequeo optimista + INSERT contra otra reserva sobre la
 * misma cancha; el exclusion constraint sigue siendo la garantía real.
 */
async function lockCourtsOrThrow(courtIds: string[], tenantId: string, tx: DbTx): Promise<void> {
  const idList = sql.join(
    courtIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const rows = (await tx.execute(sql`
    SELECT id, status
    FROM courts
    WHERE id = ANY(ARRAY[${idList}]) AND tenant_id = ${tenantId}
    ORDER BY id
    FOR UPDATE
  `)) as unknown as Array<{ id: string; status: string }>

  const found = new Map(rows.map((r) => [r.id, r.status]))
  for (const courtId of courtIds) {
    const status = found.get(courtId)
    // No encontrada = no existe o es de otro complejo. Offline = no se reserva.
    if (status !== 'online') throw new TournamentCourtUnavailableError(courtId)
  }
}

/**
 * Materializa las horas que el torneo ocupa como reservas reales.
 *
 * Estrategia calcada de `insertBookingsForSlots` (abonado.service.ts):
 * **skip-on-conflict**. Una hora ya tomada NO aborta la operación: se saltea y
 * se devuelve en `conflicts` para que el admin la vea y decida. Un torneo de 8
 * fechas no se cae porque un sábado a las 16 ya había una reserva.
 *
 * Las reservas van con `price_snapshot: 0`: la plata del torneo entra una sola
 * vez por la inscripción (categoría `tournament` en Caja), no por hora, así no
 * se cuenta dos veces.
 */
export async function reserveTournamentSlots(
  tenantId: string,
  tournamentId: string,
  staffUserId: string,
  input: ReserveSlotsInput,
  tx: DbTx,
): Promise<ReserveSlotsResult> {
  const { openingHours, closesNextDay } = await getTenantHours(tenantId, tx)
  await lockCourtsOrThrow(input.courtIds, tenantId, tx)

  const conflicts: SlotConflict[] = []
  const rows: Array<typeof bookings.$inferInsert> = []

  for (const date of input.dates) {
    // La apertura depende del día de la semana: define qué cuenta como
    // madrugada de la noche anterior.
    const dayHours = openingHours[dayKeyOf(date)]
    const openMins = timeToMins(dayHours?.open ?? '08:00')

    const slots = expandRangeToHourSlots({
      timeStart: input.timeStart,
      timeEnd: input.timeEnd,
      openMins,
      closesNextDay,
    })

    for (const courtId of input.courtIds) {
      for (const slot of slots) {
        const { startsAt, endsAt } = physicalRange({
          date,
          timeStart: slot.timeStart,
          timeEnd: slot.timeEnd,
          physicallyNextDay: slot.physicallyNextDay,
        })
        if (await hasActiveBookingOverlap(courtId, startsAt, endsAt, tx)) {
          conflicts.push({
            courtId,
            date,
            timeStart: slot.timeStart,
            timeEnd: slot.timeEnd,
          })
          continue
        }
        rows.push({
          tenantId,
          courtId,
          tournamentId,
          playerId: null,
          date: new Date(`${date}T00:00:00Z`),
          timeStart: slot.timeStart,
          timeEnd: slot.timeEnd,
          startsAt,
          endsAt,
          type: 'tournament',
          status: 'confirmed',
          // La hora del torneo no se cobra por hora: se cobra la inscripción.
          priceSnapshot: 0,
          depositAmount: 0,
          depositStatus: 'not_required',
          paymentMethod: null,
          createdByStaff: staffUserId,
        })
      }
    }
  }

  if (rows.length === 0) {
    // Todo en conflicto: es un error real, no un éxito vacío. Que la action lo
    // muestre en vez de decir "listo" sin haber tomado nada.
    throw new NoSlotsReservedError(conflicts.length)
  }

  await tx.insert(bookings).values(rows)

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.slots_reserved',
    resourceType: 'tournament',
    resourceId: tournamentId,
    metadata: {
      reserved: rows.length,
      conflicts: conflicts.length,
      courts: input.courtIds.length,
      dates: input.dates.length,
    },
  })

  return { reserved: rows.length, conflicts }
}

/**
 * Libera las horas del torneo desde una fecha en adelante.
 *
 * DELETE físico, igual que `cancelAbonado`. Cancelar con UPDATE a `canceled_*`
 * sí liberaría el exclusion constraint (su WHERE solo mira pending_payment y
 * confirmed), pero pasaría por el trigger de estados terminales y dejaría la
 * grilla y el historial del complejo llenos de reservas canceladas que nadie
 * hizo — una hora que el torneo nunca llegó a usar no es una cancelación.
 * El filtro por `date >= fromDate` conserva lo ya jugado.
 */
export async function releaseTournamentSlots(
  tenantId: string,
  tournamentId: string,
  staffUserId: string,
  fromDate: string,
  tx: DbTx,
): Promise<{ released: number }> {
  const deleted = (await tx.execute(sql`
    DELETE FROM bookings
    WHERE tenant_id = ${tenantId}
      AND tournament_id = ${tournamentId}
      AND date >= ${fromDate}::date
      AND status IN ('confirmed', 'pending_payment')
    RETURNING id
  `)) as unknown as unknown[]

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.slots_released',
    resourceType: 'tournament',
    resourceId: tournamentId,
    metadata: { released: deleted.length, fromDate },
  })

  return { released: deleted.length }
}

/** Horas que el torneo posee, de `fromDate` en adelante si se pasa. */
export async function listTournamentSlots(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
  fromDate?: string,
): Promise<TournamentSlotRow[]> {
  const rows = (await tx.execute(sql`
    SELECT id            AS "bookingId",
           court_id      AS "courtId",
           date::text    AS "date",
           time_start    AS "timeStart",
           time_end      AS "timeEnd",
           starts_at     AS "startsAt",
           ends_at       AS "endsAt"
    FROM bookings
    WHERE tenant_id = ${tenantId}
      AND tournament_id = ${tournamentId}
      AND status IN ('confirmed', 'pending_payment')
      ${fromDate ? sql`AND date >= ${fromDate}::date` : sql``}
    ORDER BY starts_at, court_id
  `)) as unknown as Array<{
    bookingId: string
    courtId: string
    date: string
    timeStart: string
    timeEnd: string
    // B8: `starts_at`/`ends_at` salen sin castear de `tx.execute`, o sea string
    // (tabla de tipos en `src/shared/db/client.ts`). El `new Date(...)` de abajo
    // ya hacía lo correcto; el tipo era el que mentía.
    startsAt: string
    endsAt: string
  }>

  return rows.map((r) => ({
    bookingId: r.bookingId,
    courtId: r.courtId,
    date: r.date,
    // Postgres devuelve TIME como 'HH:MM:SS'; la UI y los tipos usan HH:MM.
    timeStart: r.timeStart.slice(0, 5),
    timeEnd: r.timeEnd.slice(0, 5),
    startsAt: new Date(r.startsAt),
    endsAt: new Date(r.endsAt),
  }))
}

/** Cuántas horas vivas posee el torneo (guard de borrado). */
export async function countTournamentBookings(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<number> {
  const rows = (await tx.execute(sql`
    SELECT count(*)::int AS "count"
    FROM bookings
    WHERE tenant_id = ${tenantId}
      AND tournament_id = ${tournamentId}
      AND status IN ('confirmed', 'pending_payment')
  `)) as unknown as Array<{ count: number }>
  return rows[0]?.count ?? 0
}
