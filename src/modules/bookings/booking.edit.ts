import { eq, sql } from 'drizzle-orm'
import { bookings } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { invalidateAvailSearch } from '@/shared/cache/slots-cache'
import { physicalRange } from '@/shared/time/physical-range'
import {
  assertWholeHours,
  isExclusionViolation,
  lockCourtOrThrow,
  slotIsPhysicallyNextDay,
} from './booking.service'
import {
  BookingNotEditableError,
  BookingPriceBelowPaidError,
  BookingValidationError,
  SlotTakenError,
} from './booking.errors'
import { rowToBookingRow } from './booking.mappers'
import { depositCashFlowDescription, summarizeBookingCharges } from './booking.charges'
import type { BookingRow } from './booking.types'

/**
 * Editar reserva desde la grilla — D2 (docs/decisions/2026-09-15-evento-repetible-edicion-y-cobro-parcial.md).
 *
 * A diferencia de `rescheduleBooking`, esto NUNCA mueve el turno (mismo court_id,
 * mismo date/timeStart siempre): sólo puede cambiar quién figura (nombre/teléfono
 * de un invitado), cuánto dura (un evento `spontaneous` cargado por el staff,
 * horas enteras) y cuánto vale (nunca por debajo de lo ya cobrado).
 *
 * `price_snapshot` es inmutable por el trigger `enforce_booking_invariants_fn`
 * salvo dos excepciones: reprogramar (migr. 070) y ESTA — un turno `confirmed`
 * dentro de una tx que marcó `app.booking_edit = 'on'` (migr. 089). El marcador
 * se setea acá mismo, con `SET LOCAL`, sólo cuando el precio de verdad cambia.
 */

const EDITABLE_STATUS = 'confirmed'

export type EditBookingInput = {
  bookingId: string
  guestName?: string
  // `null` = borrar el teléfono a propósito (el schema normaliza '' a esto);
  // `undefined` = no tocarlo. Ver el comentario en editBookingSchema.
  guestPhone?: string | null
  timeEnd?: string
  priceOverride?: number
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
  guest_name: string | null
  guest_phone: string | null
  created_by_staff: string | null
}

async function lockBooking(bookingId: string, tx: DbTx): Promise<LockedBooking | undefined> {
  const rows = await tx.execute(sql`
    SELECT id, tenant_id, court_id, player_id, status, type, price_snapshot,
           deposit_amount, deposit_status,
           date::text AS date, time_start::text AS time_start, time_end::text AS time_end,
           guest_name, guest_phone, created_by_staff
    FROM bookings
    WHERE id = ${bookingId}
    FOR UPDATE
  `)
  return (rows as unknown as LockedBooking[])[0]
}

/**
 * Cancha del booking SIN lock, sólo para saber a cuál tomarle el lock ANTES
 * que al booking (mismo orden que `rescheduleBooking`: `createManualBooking`
 * lockea la cancha y después inserta, y su INSERT puede quedar esperando el
 * exclusion constraint contra un booking que esta tx ya tenga tomado — lockear
 * acá el booking primero y la cancha después dejaría las dos transacciones
 * esperándose en cruz). Es una lectura desactualizable a propósito: todo lo
 * que importa se vuelve a leer bajo el `FOR UPDATE` de `lockBooking` un
 * instante después.
 */
async function peekCourtId(tenantId: string, bookingId: string, tx: DbTx): Promise<string | null> {
  const rows = await tx.execute(sql`
    SELECT court_id FROM bookings WHERE id = ${bookingId} AND tenant_id = ${tenantId} LIMIT 1
  `)
  return (rows as unknown as Array<{ court_id: string }>)[0]?.court_id ?? null
}

/**
 * Mismo criterio que `assertSlotFreeForOther` de `booking.reschedule.ts`
 * (duplicado a propósito: es privado allá y la forma es de 6 líneas — la
 * documentación de por qué no se comparte vive en ese archivo).
 */
async function assertNoOverlapExcept(
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
 * Plata YA cobrada de este turno — mismo cálculo que `collectedSoFar` de
 * `booking.reschedule.ts` (duplicado por el mismo motivo documentado ahí: es
 * privado allá, y `getBookingCharges` vive en `app/` — un módulo de dominio no
 * puede importarla).
 */
async function collectedSoFar(
  tenantId: string,
  booking: Pick<LockedBooking, 'id' | 'price_snapshot' | 'deposit_amount' | 'deposit_status'>,
  tx: DbTx,
): Promise<number> {
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

export async function editBooking(
  tenantId: string,
  staffUserId: string,
  input: EditBookingInput,
  tx: DbTx,
): Promise<BookingRow> {
  const peekedCourtId = await peekCourtId(tenantId, input.bookingId, tx)
  if (!peekedCourtId) throw new BookingNotEditableError(input.bookingId, 'not_found')

  // Mismo orden de locks que `rescheduleBooking`: cancha primero, booking
  // después (ver el comentario de `peekCourtId`).
  await lockCourtOrThrow(peekedCourtId, tx)

  const booking = await lockBooking(input.bookingId, tx)
  if (!booking || booking.tenant_id !== tenantId) {
    throw new BookingNotEditableError(input.bookingId, 'not_found')
  }
  if (booking.status !== EDITABLE_STATUS) {
    throw new BookingNotEditableError(input.bookingId, 'terminal_status')
  }
  if (booking.type === 'block' || booking.type === 'tournament') {
    throw new BookingNotEditableError(input.bookingId, 'not_a_player_booking')
  }

  // Nombre/teléfono: sólo un invitado (sin jugador registrado) puede editarlos.
  if (
    (input.guestName !== undefined || input.guestPhone !== undefined) &&
    booking.player_id !== null
  ) {
    throw new BookingValidationError(
      'No se puede editar nombre y teléfono de un jugador registrado.',
    )
  }

  const currentTimeEnd = booking.time_end.slice(0, 5)
  let plannedTimeEnd: string | undefined
  let plannedEndsAt: Date | undefined
  if (input.timeEnd !== undefined && input.timeEnd !== currentTimeEnd) {
    const requestedTimeEnd = input.timeEnd
    // La duración sólo se edita en un evento de N horas cargado por el staff
    // (`spontaneous`). Una reserva ONLINE es también `type='spontaneous'`
    // (createOnlineBookingImpl, booking.service.ts) — lo que la distingue es
    // `created_by_staff IS NULL`, el MISMO predicado que ya usa el contador del
    // aha moment ("primera reserva online") en ese archivo. Sin este segundo
    // check, este edit le estiraría la duración a la reserva de 60 min que un
    // jugador compró como producto de 60 min.
    if (booking.type !== 'spontaneous') {
      throw new BookingValidationError(
        'Solo se puede cambiar la duración de un evento cargado por el complejo.',
      )
    }
    if (booking.created_by_staff === null) {
      throw new BookingValidationError('No se puede cambiar la duración de una reserva online.')
    }
    // Cambiar la duración sin mandar el precio final dejaría `price_snapshot`
    // apuntando a la tarifa de la duración VIEJA — la UI siempre calcula el
    // sugerido con `priceForRange` y lo manda como `priceOverride`; achicar
    // este chequeo sería reabrir el mismo agujero que Fase 3 (hallazgo #1)
    // cerró para el alta manual.
    if (input.priceOverride === undefined) {
      throw new BookingValidationError('Al cambiar la duración, indicá el precio del turno.')
    }
    assertWholeHours(booking.time_start.slice(0, 5), requestedTimeEnd)
    const physicallyNextDay = await slotIsPhysicallyNextDay(
      tenantId,
      booking.date,
      booking.time_start.slice(0, 5),
      tx,
    )
    const range = physicalRange({
      date: booking.date,
      timeStart: booking.time_start.slice(0, 5),
      timeEnd: requestedTimeEnd,
      physicallyNextDay,
    })
    await assertNoOverlapExcept(booking.court_id, booking.id, range.startsAt, range.endsAt, tx)
    plannedTimeEnd = requestedTimeEnd
    plannedEndsAt = range.endsAt
  }

  // A diferencia de `rescheduleBooking` — que en una sesión de abonado (`type
  // === 'fixed'`) IGNORA el precio pedido y conserva siempre el del contrato —
  // acá el override SÍ se aplica. Decisión del dueño 2026-09-15: corregir el
  // precio de una fecha puntual (una promo, un feriado) queda permitido, pero
  // sólo pisa `price_snapshot` de ESTA fila; `abonados.price_per_session` (el
  // contrato) y las demás sesiones ya generadas no se tocan. El audit log de
  // abajo marca `priceSource: 'session_override'` para que quede explícito que
  // no fue una edición del contrato.
  let plannedPriceSnapshot: number | undefined
  if (input.priceOverride !== undefined && input.priceOverride !== booking.price_snapshot) {
    const requestedPrice = input.priceOverride
    const alreadyPaid = await collectedSoFar(tenantId, booking, tx)
    if (requestedPrice < alreadyPaid) {
      throw new BookingPriceBelowPaidError(input.bookingId)
    }
    plannedPriceSnapshot = requestedPrice
  }

  const updates: Partial<typeof bookings.$inferInsert> = { updatedAt: new Date() }
  if (input.guestName !== undefined) updates.guestName = input.guestName
  if (input.guestPhone !== undefined) updates.guestPhone = input.guestPhone
  if (plannedTimeEnd !== undefined) {
    updates.timeEnd = plannedTimeEnd
    updates.endsAt = plannedEndsAt
  }
  if (plannedPriceSnapshot !== undefined) {
    // El trigger sólo abre la Regla 2 con el marcador puesto — `SET LOCAL`
    // (vía `set_config(..., true)`), nunca `SET` a secas: tiene que morir con
    // la transacción, no filtrarse a la próxima query de esta conexión pooleada.
    await tx.execute(sql`SELECT set_config('app.booking_edit', 'on', true)`)
    updates.priceSnapshot = plannedPriceSnapshot
  }

  let updatedRow
  try {
    const rows = await tx
      .update(bookings)
      .set(updates)
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
    actorId: staffUserId,
    actorType: 'staff',
    action: 'booking.edited',
    resourceType: 'booking',
    resourceId: input.bookingId,
    metadata: {
      before: {
        guestName: booking.guest_name,
        guestPhone: booking.guest_phone,
        timeEnd: currentTimeEnd,
        priceSnapshot: booking.price_snapshot,
      },
      after: {
        guestName: bookingRow.guestName,
        guestPhone: bookingRow.guestPhone,
        timeEnd: bookingRow.timeEnd,
        priceSnapshot: bookingRow.priceSnapshot,
      },
      // Sesión de abonado (`type='fixed'`) con precio tocado: a diferencia de
      // `rescheduleBooking` (que SIEMPRE conserva el precio del contrato), esto
      // sí lo cambia — decisión del dueño 2026-09-15. El marcador deja explícito
      // en el trail que fue una excepción puntual a ESTA sesión, no una edición
      // del contrato (`abonados.price_per_session` queda intacto).
      ...(booking.type === 'fixed' && plannedPriceSnapshot !== undefined
        ? { priceSource: 'session_override' as const }
        : {}),
    },
  })

  // Sólo si la duración cambió: mover/estirar el fin del turno cambia qué
  // huecos ofrece la grilla ese día. Nombre/teléfono/precio no afectan
  // disponibilidad — invalidar ahí sería trabajo de más sin ningún lector que
  // lo necesite.
  if (plannedTimeEnd !== undefined) await invalidateAvailSearch(booking.date)

  return bookingRow
}
