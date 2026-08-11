import { eq, sql } from 'drizzle-orm'
import { bookings, tenants } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { invalidateAvailSearch } from '@/shared/cache/slots-cache'
import { enqueueNotification } from '@/modules/notifications/notification.service'
import { calculatePrice } from '@/modules/courts/court.service'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import { addDays, artTodayStr } from '@/shared/dates/art'
import { physicalRange } from '@/shared/time/physical-range'
import { isValidCalendarDate } from '@/shared/validation/calendar-date'
import { formatArs } from '@/lib/format'
import { captureMessage } from '@/lib/sentry'
import {
  artDateAt,
  assertSlotDuration,
  isExclusionViolation,
  lockCourtOrThrow,
  slotIsPhysicallyNextDay,
} from './booking.service'
import {
  BookingDateOutOfRangeError,
  BookingNotReschedulableError,
  CourtOfflineError,
  PriceUnavailableError,
  SlotTakenError,
} from './booking.errors'
import { rowToBookingRow } from './booking.mappers'
import { depositCashFlowDescription, summarizeBookingCharges } from './booking.charges'
import type { BookingRow } from './booking.types'

/**
 * Reprogramar un turno — Fase 3 (contrato v2 §3, criterio de salida #2).
 *
 * Es un UPDATE del MISMO booking, no cancelar+crear. Conservar el id importa:
 * mantiene el historial, los cobros ya registrados (`cash_flows.booking_id`) y
 * la seña; y evita ensuciar las métricas con una cancelación que nadie hizo.
 * El trigger `enforce_booking_invariants_fn` no bloquea UPDATEs sobre un turno
 * vivo, así que el camino está abierto — salvo `price_snapshot`, para el que la
 * migración 070 abrió una excepción acotada a exactamente este caso.
 *
 * No cambia `status`: por eso no pasa por `assertTransition`.
 */

const RESCHEDULABLE_STATUSES = ['confirmed', 'pending_payment'] as const

export type RescheduleBookingInput = {
  bookingId: string
  /** Cancha destino. Puede ser la misma. */
  courtId: string
  /** Día operativo destino, YYYY-MM-DD. */
  date: string
  timeStart: string
  timeEnd: string
  staffUserId: string
  /**
   * Precio explícito en centavos. Sin esto el precio se RECALCULA a la tarifa
   * de la franja destino (decisión de producto 2026-08-04: el precio pertenece
   * a la franja, no a la reserva).
   *
   * El escape hatch existe porque no hay forma de distinguir un
   * `price_snapshot` que salió de la grilla de tarifas de uno que el admin
   * escribió a mano: sin él, mover un turno con precio pactado lo devolvería en
   * silencio a la tarifa de lista.
   */
  priceOverride?: number
}

export type RescheduleOutcome = {
  booking: BookingRow
  /** De dónde salió — para el toast, el audit y el email. */
  from: { courtId: string; courtName: string; date: string; timeStart: string; timeEnd: string }
  priceChanged: boolean
  /**
   * Notificaciones encoladas DENTRO de esta tx. El caller las despacha con
   * `dispatchEmail` DESPUÉS del commit (mismo patrón que `cancelByAdmin`).
   */
  notificationIds: string[]
}

type LockedBooking = {
  id: string
  tenant_id: string
  court_id: string
  player_id: string | null
  status: string
  type: string
  price_snapshot: number
  deposit_amount: number
  deposit_status: string
  date: string
  time_start: string
  time_end: string
}

async function lockBooking(bookingId: string, tx: DbTx): Promise<LockedBooking | undefined> {
  const rows = await tx.execute(sql`
    SELECT id, tenant_id, court_id, player_id, status, type, price_snapshot,
           deposit_amount, deposit_status,
           date::text AS date, time_start::text AS time_start, time_end::text AS time_end
    FROM bookings
    WHERE id = ${bookingId}
    FOR UPDATE
  `)
  return (rows as unknown as LockedBooking[])[0]
}

/**
 * Plata YA cobrada de este turno, con el mismo criterio que `/reservas` y la
 * grilla: seña efectivamente retenida + cobros de mostrador, excluyendo la fila
 * de cash_flow que refleja la propia seña (o se contaría dos veces).
 *
 * Se calcula acá con SQL y no vía `getBookingCharges` porque esa función vive
 * en la capa `app/` y un módulo de dominio no puede importarla.
 */
async function collectedSoFar(tenantId: string, booking: LockedBooking, tx: DbTx): Promise<number> {
  const rows = await tx.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::int AS total
    FROM cash_flows
    WHERE tenant_id = ${tenantId}
      AND booking_id = ${booking.id}
      AND type = 'income'
      AND category = 'booking'
      AND description <> ${depositCashFlowDescription(booking.id)}
  `)
  const chargesTotal = (rows as unknown as Array<{ total: number }>)[0]?.total ?? 0
  const { totalPaid } = summarizeBookingCharges({
    priceSnapshot: booking.price_snapshot,
    depositAmount: booking.deposit_amount,
    depositStatus: booking.deposit_status,
    chargesTotal,
  })
  return totalPaid
}

/**
 * Igual que el `checkOverlapOrThrow` de creación, pero ignorando el propio
 * turno. Sin el `id <> ...` un turno que se mueve dentro de su mismo rango (o
 * que se corre una fracción) chocaría CONSIGO MISMO y devolvería un
 * "slot ocupado" falso.
 *
 * El backstop real sigue siendo el exclusion constraint de la DB; esto sólo
 * permite dar un error lindo antes de llegar ahí.
 */
async function assertSlotFreeForOther(
  courtId: string,
  bookingId: string,
  startsAt: Date,
  endsAt: Date,
  tx: DbTx,
): Promise<void> {
  const rows = await tx.execute(sql`
    SELECT 1
    FROM bookings
    WHERE court_id = ${courtId}
      AND id <> ${bookingId}
      AND status IN ('pending_payment', 'confirmed')
      AND tstzrange(starts_at, ends_at) && tstzrange(${startsAt.toISOString()}, ${endsAt.toISOString()})
    LIMIT 1
  `)
  if ((rows as unknown as unknown[]).length > 0) throw new SlotTakenError()
}

/**
 * La ventana de fechas del destino: ni al pasado ni más allá de la anticipación
 * que el complejo permite.
 *
 * `getAvailableSlots` NO aplica ninguna de las dos (sólo sabe de horarios y
 * ocupación), así que si la UI ofrece un hueco fuera de rango, este es el único
 * lugar que lo frena.
 */
function assertDateWindow(date: string, maxAdvanceDays: number | undefined): void {
  if (!isValidCalendarDate(date)) throw new BookingDateOutOfRangeError('past_date')
  const today = artTodayStr()
  if (date < today) throw new BookingDateOutOfRangeError('past_date')
  if (maxAdvanceDays !== undefined && date > addDays(today, maxAdvanceDays)) {
    throw new BookingDateOutOfRangeError('advance_exceeded')
  }
}

/** Date (columna DATE, sin componente horario) → "DD/MM/YYYY". */
function formatDateArs(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

/**
 * "YYYY-MM-DD" → "DD/MM/YYYY". La fecha de ORIGEN llega como string (la query
 * de lock la trae con `date::text`) y la de DESTINO como Date: sin esto el
 * email mostraba las dos fechas del mismo mensaje en formatos distintos
 * ("se movió del 2026-08-04 al 05/08/2026").
 */
function formatDateStrArs(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

async function loadEmailNames(
  tenantId: string,
  courtId: string,
  playerId: string,
  tx: DbTx,
): Promise<{ courtName: string; tenantName: string; playerFirstName: string } | undefined> {
  const rows = await tx.execute(sql`
    SELECT c.name AS court_name, t.name AS tenant_name, p.first_name AS player_first_name
    FROM courts c, tenants t, players p
    WHERE c.id = ${courtId} AND t.id = ${tenantId} AND p.id = ${playerId}
  `)
  const row = (
    rows as unknown as Array<{
      court_name: string
      tenant_name: string
      player_first_name: string
    }>
  )[0]
  if (!row) return undefined
  return {
    courtName: row.court_name,
    tenantName: row.tenant_name,
    playerFirstName: row.player_first_name,
  }
}

async function loadOriginCourtName(courtId: string, tx: DbTx): Promise<string> {
  const rows = await tx.execute(sql`SELECT name FROM courts WHERE id = ${courtId}`)
  return (rows as unknown as Array<{ name: string }>)[0]?.name ?? 'Cancha'
}

export async function rescheduleBooking(
  tenantId: string,
  input: RescheduleBookingInput,
  tx: DbTx,
): Promise<RescheduleOutcome> {
  assertSlotDuration(input.timeStart, input.timeEnd)

  // ORDEN DE LOCKS: primero la cancha destino, después el booking.
  //
  // No es arbitrario. `createManualBooking` lockea la cancha y después inserta,
  // y su INSERT puede quedar esperando al exclusion constraint contra un
  // booking que otra transacción tenga tomado. Si acá lockeáramos el booking
  // primero y la cancha después, dos transacciones concurrentes (una creando,
  // otra reprogramando sobre la misma cancha) se esperarían en cruz y Postgres
  // mataría una por deadlock. Tomando la cancha primero, las dos entran por la
  // misma puerta y la segunda simplemente espera.
  const court = await lockCourtOrThrow(input.courtId, tx)
  if (court.tenantId !== tenantId) throw new CourtOfflineError(input.courtId)

  const booking = await lockBooking(input.bookingId, tx)
  if (!booking || booking.tenant_id !== tenantId) {
    throw new BookingNotReschedulableError(input.bookingId, 'terminal_status')
  }
  if (!(RESCHEDULABLE_STATUSES as readonly string[]).includes(booking.status)) {
    throw new BookingNotReschedulableError(input.bookingId, 'terminal_status')
  }
  if (booking.type === 'tournament' || booking.type === 'block') {
    throw new BookingNotReschedulableError(input.bookingId, 'not_a_player_booking')
  }
  // Sesión de abonado (`type: 'fixed'`): HABILITADA para moverse (decisión del
  // dueño, 2026-08-05). Estaba bloqueada porque su precio no sale de la grilla
  // de tarifas —`generateAbonadoSlots` graba `priceSnapshot =
  // abonado.price_per_session` (abonado.service.ts:132)— y recalcular contra
  // `court.pricing` le pisaría al cliente el precio pactado, en silencio.
  //
  // El bloqueo se levanta conservando ese precio: ver la rama `type === 'fixed'`
  // del cálculo más abajo. `abonado_id` y `type` no están en el `.set()` del
  // UPDATE, así que la sesión sigue perteneciendo al abonado.
  // 🔴 Seña esperando pago: NO se puede mover. `deposit_amount` se calculó como
  // un % del precio VIEJO (createOnlineBooking, booking.service.ts:438) y este
  // UPDATE no lo recalcula — moverlo a una franja más barata dejaría una seña
  // MAYOR al precio total del turno, y ese monto stale es justo el que cobra
  // MercadoPago. Además hay un link de pago vivo con el monto ya cotizado al
  // jugador. Se bloquea en vez de recalcular: cambiar el precio abajo de una
  // preferencia de MP ya emitida es otro problema, no el de esta fase.
  if (booking.deposit_status === 'pending') {
    throw new BookingNotReschedulableError(input.bookingId, 'deposit_pending')
  }

  const settingsRows = await tx
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const settings = settingsRows[0]?.settings as TenantSettings | undefined
  // `?? 6` igual que TODOS los demás consumidores del campo (reservar público,
  // availability-search, listRescheduleSlotsAction). Sin el fallback, un tenant
  // sin la clave en `settings` dejaría la ventana de anticipación SIN límite acá
  // mientras el selector de la UI sí la acota a 6 días — no es alcanzable hoy
  // (el default de la columna la trae), pero la divergencia no tiene por qué existir.
  assertDateWindow(input.date, settings?.booking_advance_days ?? 6)

  let priceSnapshot: number
  let priceOverridden = false
  if (booking.type === 'fixed') {
    // 🔴 El precio del contrato, y NADA más. Sale del `price_snapshot` de la
    // sesión —no de un SELECT a `abonados.price_per_session`— porque es el
    // precio pactado para ESA sesión cuando se generó: si mañana existe una
    // función para editar el precio del contrato, esa edición tiene que aplicar
    // hacia adelante, no reescribir sesiones ya comunicadas al cliente.
    //
    // Va ANTES del check de `priceOverride` a propósito: un `priceOverride`
    // inyectado por un caller (hoy nadie lo pasa, pero el campo es público en
    // el input) NO puede pisar el precio pactado. "Nunca se recalcula" también
    // significa "nunca se pisa desde afuera", no solo "no contra court.pricing".
    priceSnapshot = booking.price_snapshot
  } else if (input.priceOverride !== undefined) {
    priceSnapshot = input.priceOverride
    priceOverridden = true
  } else {
    const calc = calculatePrice(court.pricing, artDateAt(input.date, input.timeStart))
    if (calc === null) throw new PriceUnavailableError()
    priceSnapshot = calc
  }

  // El precio nuevo no puede quedar por DEBAJO de lo ya cobrado: eso deja al
  // turno con saldo negativo silencioso (el cliente pagó $24.000 por una franja
  // cara y el turno pasa a valer $10.000). `summarizeBookingCharges` clampea el
  // pendiente en 0, así que la diferencia no aparecería en ningún lado —
  // simplemente se la traga el sistema. Fail-closed: que el admin cancele y
  // reembolse por el camino que sí registra la devolución.
  if (priceSnapshot < booking.price_snapshot) {
    const alreadyPaid = await collectedSoFar(tenantId, booking, tx)
    if (priceSnapshot < alreadyPaid) {
      throw new BookingNotReschedulableError(input.bookingId, 'price_below_paid')
    }
  }

  const physicallyNextDay = await slotIsPhysicallyNextDay(tenantId, input.date, input.timeStart, tx)
  const { startsAt, endsAt } = physicalRange({
    date: input.date,
    timeStart: input.timeStart,
    timeEnd: input.timeEnd,
    physicallyNextDay,
  })

  await assertSlotFreeForOther(input.courtId, input.bookingId, startsAt, endsAt, tx)

  const from = {
    courtId: booking.court_id,
    courtName: await loadOriginCourtName(booking.court_id, tx),
    date: booking.date,
    timeStart: booking.time_start.slice(0, 5),
    timeEnd: booking.time_end.slice(0, 5),
  }
  const priceChanged = priceSnapshot !== booking.price_snapshot

  let updatedRow
  try {
    // Las SEIS columnas del slot se reescriben juntas. `starts_at`/`ends_at` son
    // la fuente de verdad del exclusion constraint: dejarlas apuntando al slot
    // viejo haría que la DB no vea el choque real (migr. 040/041).
    const rows = await tx
      .update(bookings)
      .set({
        courtId: input.courtId,
        date: new Date(`${input.date}T00:00:00Z`),
        timeStart: input.timeStart,
        timeEnd: input.timeEnd,
        startsAt,
        endsAt,
        priceSnapshot,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, input.bookingId))
      .returning()
    updatedRow = rows[0]!
  } catch (err) {
    if (isExclusionViolation(err)) throw new SlotTakenError()
    throw err
  }

  const bookingRow = rowToBookingRow(updatedRow)

  await insertAuditLog(tx, {
    tenantId,
    actorId: input.staffUserId,
    actorType: 'staff',
    action: 'booking.rescheduled',
    resourceType: 'booking',
    resourceId: input.bookingId,
    metadata: {
      fromCourtId: from.courtId,
      fromDate: from.date,
      fromTimeStart: from.timeStart,
      toCourtId: input.courtId,
      toDate: input.date,
      toTimeStart: input.timeStart,
      oldPrice: booking.price_snapshot,
      newPrice: priceSnapshot,
      // `priceOverridden`, no `input.priceOverride !== undefined`: en una sesión
      // de abonado el override del caller se ignora, así que loguearlo como
      // aplicado sería mentir en el audit trail.
      priceOverridden,
      // Deja escrito en el trail POR QUÉ el precio no se recalculó.
      ...(booking.type === 'fixed' ? { priceSource: 'abonado_contract' as const } : {}),
    },
  })

  // DOS invalidaciones: el día del que se libera y el día al que se mueve.
  // Ningún otro flujo mueve un booking, así que ninguno tenía que hacer esto.
  // Si es el mismo día, una sola: el cache está indexado por fecha.
  await invalidateAvailSearch(from.date)
  if (input.date !== from.date) await invalidateAvailSearch(input.date)

  const notificationIds: string[] = []
  if (bookingRow.playerId) {
    const names = await loadEmailNames(tenantId, input.courtId, bookingRow.playerId, tx)
    if (names) {
      notificationIds.push(
        await enqueueNotification(
          {
            tenantId,
            recipientType: 'player',
            recipientId: bookingRow.playerId,
            templateName: 'booking_rescheduled',
            content: {
              playerFirstName: names.playerFirstName,
              tenantName: names.tenantName,
              fromCourtName: from.courtName,
              fromDate: formatDateStrArs(from.date),
              fromTimeStart: from.timeStart,
              fromTimeEnd: from.timeEnd,
              toCourtName: names.courtName,
              toDate: formatDateArs(bookingRow.date),
              toTimeStart: bookingRow.timeStart.slice(0, 5),
              toTimeEnd: bookingRow.timeEnd.slice(0, 5),
              price: formatArs(priceSnapshot),
              priceChanged,
            },
            triggerEvent: 'booking.rescheduled',
          },
          tx,
        ),
      )
    } else {
      // Mismo caso que en cancelación: sin fila PTR el jugador no es visible
      // bajo el contexto de tenant y el email se saltearía sin dejar rastro.
      captureMessage('reschedule email skipped: player not visible under tenant context', {
        level: 'warning',
        extra: { bookingId: bookingRow.id, tenantId, playerId: bookingRow.playerId },
      })
    }
  }

  return { booking: bookingRow, from, priceChanged, notificationIds }
}
