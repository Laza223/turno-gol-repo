import { and, eq, sql } from 'drizzle-orm'
import {
  bookings,
  courts,
  tenants,
} from '@/shared/db/schema'
import { checkPlayerBanned } from '@/modules/bans/ban.service'
import type { DbTx } from '@/shared/db/client'
import { invalidateAvailSearch } from '@/shared/cache/slots-cache'
import { ensurePTR } from '@/modules/relationships/ptr.service'
import { calculatePrice } from '@/modules/courts/court.service'
import { priceForSlot } from '@/lib/booking/pricing'
import type { CourtPricingData } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import {
  enqueueNotification,
  enqueueTenantOwnerNotification,
} from '@/modules/notifications/notification.service'
import {
  BookingDateOutOfRangeError,
  BookingNotInConfirmedError,
  BookingNotInNoShowError,
  BookingNotYetEndedError,
  BookingValidationError,
  CourtOfflineError,
  NoShowCorrectionWindowExpiredError,
  NoShowNotYetEndedError,
  NoShowRevertWindowExpiredError,
  PlayerBannedError,
  PriceUnavailableError,
  SlotTakenError,
  TooManyActiveHoldsError,
} from './booking.errors'
import { addDays, artTodayStr } from '@/shared/dates/art'
import { MAX_ACTIVE_HOLDS_PER_PLAYER, SLOT_DURATION_MINUTES } from '@/shared/constants'
import {
  effectiveCloseMins,
  endLabelFromMins,
  normalizeRangeToOpenDay,
} from '@/shared/time/operating-day'
import { physicalRange } from '@/shared/time/physical-range'
import { isValidCalendarDate } from '@/shared/validation/calendar-date'
import { rowToBookingRow } from './booking.mappers'
import { depositCashFlowDescription } from './booking.charges'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'
import { formatArs } from '@/modules/payments/payment.service'
import { captureMessage } from '@/lib/sentry'
import { calcDepositCents } from './deposit'
import { assertTransition } from './booking.state-machine'
import { transitionFromPendingPayment } from './booking.concurrency'
import { scheduleBookingExpiry } from '@/shared/jobs/schedule-expiry'
import type {
  AvailableSlot,
  BookingRow,
  BookingStatus,
  CreateManualBookingInput,
  CreateOnlineBookingInput,
  PaymentMethodValue,
  TransitionResult,
} from './booking.types'
import { track, withSpan } from '@/shared/observability'

const PG_EXCLUSION_VIOLATION = '23P01'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Build a Date that, when converted to ART (UTC-3), lands at the given local clock time.
export function artDateAt(dateStr: string, hhmm: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1, (h ?? 0) + 3, m ?? 0))
}

/**
 * Tarea #6: duración de un turno en minutos a partir de time_start/time_end.
 * El cierre a medianoche ('00:00') cuenta como fin del día (1440) para que
 * 23:00→00:00 dé 60 min. Tolera strings con segundos (HH:MM:SS).
 */
export function slotDurationMins(timeStart: string, timeEnd: string): number {
  const start = timeToMins(timeStart.slice(0, 5))
  let end = timeToMins(timeEnd.slice(0, 5))
  if (end === 0) end = 24 * 60
  return end - start
}

/**
 * Tarea #6: el sistema solo ofrece turnos de 60 minutos. Para arreglos
 * especiales (2 horas seguidas, escuelitas) se reservan turnos separados o el
 * admin usa un `block`. Los `block` (mantenimiento) sí pueden abarcar varias
 * horas, así que se excluyen de esta validación.
 */
export function assertSlotDuration(timeStart: string, timeEnd: string): void {
  if (slotDurationMins(timeStart, timeEnd) !== SLOT_DURATION_MINUTES) {
    throw new BookingValidationError(
      `Los turnos son de ${SLOT_DURATION_MINUTES} minutos.`,
    )
  }
}

/**
 * Día operativo: ¿este slot ocurre FÍSICAMENTE el día calendario siguiente?
 * Un turno de madrugada (timeStart < apertura) en un complejo con
 * closes_next_day pertenece a HOY operativo (bookings.date) pero sucede mañana,
 * así que su hora de pared ya pasó hoy sin estar vencido. Lee las horas del
 * tenant (global, sin RLS) para decidirlo.
 */
export async function slotIsPhysicallyNextDay(
  tenantId: string,
  dateStr: string,
  timeStart: string,
  tx: DbTx,
): Promise<boolean> {
  const rows = await tx
    .select({
      openingHours: tenants.openingHours,
      closesNextDay: tenants.closesNextDay,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const tenant = rows[0]
  if (!tenant || !tenant.closesNextDay) return false
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dayKey = DAY_KEYS[new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1)).getUTCDay()]!
  const dayHours = (tenant.openingHours as OpeningHours)[dayKey as keyof OpeningHours]
  const openMins = timeToMins(dayHours?.open ?? '08:00')
  return timeToMins(timeStart.slice(0, 5)) < openMins
}

export function isExclusionViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === PG_EXCLUSION_VIOLATION
  )
}

export async function lockCourtOrThrow(
  courtId: string,
  tx: DbTx,
): Promise<{ id: string; tenantId: string; pricing: CourtPricingData; name: string }> {
  // SELECT FOR UPDATE serializes concurrent INSERTs targeting this court.
  const result = await tx.execute(sql`
    SELECT id, tenant_id AS "tenantId", pricing, status, name
    FROM courts
    WHERE id = ${courtId}
    FOR UPDATE
  `)
  const row = (result as unknown as Array<{
    id: string
    tenantId: string
    pricing: CourtPricingData
    status: string
    name: string
  }>)[0]
  if (!row || row.status !== 'online') {
    throw new CourtOfflineError(courtId)
  }
  return { id: row.id, tenantId: row.tenantId, pricing: row.pricing, name: row.name }
}

async function checkOverlapOrThrow(
  courtId: string,
  startsAt: Date,
  endsAt: Date,
  tx: DbTx,
): Promise<void> {
  const result = await tx.execute(sql`
    SELECT 1
    FROM bookings
    WHERE court_id = ${courtId}
      AND status IN ('pending_payment', 'confirmed')
      AND tstzrange(starts_at, ends_at) && tstzrange(${startsAt.toISOString()}, ${endsAt.toISOString()})
    LIMIT 1
  `)
  if ((result as unknown as unknown[]).length > 0) {
    throw new SlotTakenError()
  }
}

// ─── createManualBooking (Flujo 3) ──────────────────────────────────
export async function createManualBooking(
  tenantId: string,
  input: CreateManualBookingInput,
  tx: DbTx,
): Promise<BookingRow> {
  // Tarea #6: reservas son de 60 min. Los `block` (mantenimiento) pueden abarcar
  // varias horas, así que no se validan.
  if (input.type !== 'block') {
    assertSlotDuration(input.timeStart, input.timeEnd)
  }

  const court = await lockCourtOrThrow(input.courtId, tx)
  if (court.tenantId !== tenantId) {
    throw new CourtOfflineError(input.courtId)
  }

  let priceSnapshot: number
  if (input.priceOverride !== undefined) {
    priceSnapshot = input.priceOverride
  } else if (input.type === 'block') {
    priceSnapshot = 0
  } else {
    const calc = calculatePrice(
      court.pricing,
      artDateAt(input.date, input.timeStart),
    )
    if (calc === null) throw new PriceUnavailableError()
    priceSnapshot = calc
  }

  const physicallyNextDay = await slotIsPhysicallyNextDay(
    tenantId, input.date, input.timeStart, tx,
  )
  const { startsAt, endsAt } = physicalRange({
    date: input.date, timeStart: input.timeStart, timeEnd: input.timeEnd, physicallyNextDay,
  })

  await checkOverlapOrThrow(input.courtId, startsAt, endsAt, tx)

  const depositAmount = input.depositAmount ?? 0
  const depositStatus = input.depositStatus ?? 'not_required'
  // chk_booking_payment_consistency:
  //   * mercadopago + payment_id NOT NULL  (P10 only — manual flow rejects this)
  //   * cash/transfer/other + payment_id NULL
  //   * NULL method + deposit_status='not_required'
  const paymentMethod =
    input.depositMethod && input.depositMethod !== 'mercadopago'
      ? input.depositMethod
      : null

  try {
    const inserted = await tx
      .insert(bookings)
      .values({
        tenantId,
        courtId: input.courtId,
        playerId: input.playerId ?? null,
        createdByStaff: input.staffUserId,
        date: new Date(`${input.date}T00:00:00Z`),
        timeStart: input.timeStart,
        timeEnd: input.timeEnd,
        startsAt,
        endsAt,
        type: input.type,
        status: 'confirmed',
        priceSnapshot,
        depositAmount,
        depositStatus,
        paymentMethod,
        guestName: input.playerId ? null : (input.guestName ?? null),
        guestPhone: input.playerId ? null : (input.guestPhone ?? null),
        notesInternal: input.notesInternal ?? null,
        notesPlayer: input.notesPlayer ?? null,
      })
      .returning()

    const created = rowToBookingRow(inserted[0]!)

    // La seña que el staff ya cobró en el mostrador tiene que entrar a Caja.
    // `depositIsCounted` es EL MISMO predicado que `summarizeBookingCharges`
    // usa para `depositCounted` (booking.charges.ts): la invariante es
    // "existe fila en cash_flows ⟺ el resumen del turno cuenta la seña".
    // Con cualquier otro criterio, Caja y el detalle del turno divergen.
    const depositIsCounted = depositStatus === 'paid' || depositStatus === 'captured'
    if (depositIsCounted && depositAmount > 0 && input.depositMethod) {
      await recordManualBookingDepositCashFlow(
        created,
        // `input.depositMethod`, NUNCA `created.paymentMethod`: para
        // 'mercadopago' la columna se persiste NULL (lo exige
        // chk_booking_payment_consistency, ver arriba) y `cash_flows.method` es
        // NOT NULL. Acá vive el único rastro del medio real.
        input.depositMethod,
        input.staffUserId,
        tenantId,
        tx,
      )
    }

    await invalidateAvailSearch(input.date)
    track.booking('booking.manual.create.success', {
      bookingId: created.id,
      tenantId: created.tenantId,
      courtId: created.courtId,
      playerId: created.playerId ?? undefined,
    })
    return created
  } catch (err) {
    if (isExclusionViolation(err)) throw new SlotTakenError()
    throw err
  }
}

/**
 * Inserta el cash_flow de ingreso por la seña que el staff YA cobró al dar de
 * alta la reserva en el mostrador. Tercer emisor del mismo movimiento, hermano
 * de `recordManualDepositCashFlow` (confirmar una seña pendiente) y
 * `recordDepositCashFlow` (webhook de MP), los dos en payment.service.ts.
 *
 * Se duplica el patrón en vez de compartir código, por las mismas razones que
 * ya documenta `recordManualDepositCashFlow`, más una propia: allá el tipo del
 * método es `ManualDepositMethod`, que excluye 'mercadopago' A PROPÓSITO (esa
 * seña la confirma el webhook). Acá hace falta el `PaymentMethodValue`
 * completo: el staff puede cobrar de mostrador con el QR de MP y anotar la
 * reserva a mano. Unificar obligaría a ensanchar ese tipo y desarmaría el guard
 * que impide que `confirmDepositPaymentAction` acepte 'mercadopago'.
 *
 * OJO — el catch de acá abajo es PARCIAL, no un cinturón de seguridad. Solo
 * `DayAlreadyClosedError` es realmente atrapable porque lo tira `assertDayOpen`
 * en JS, ANTES de mandar SQL. Cualquier violación de constraint (amount > 0,
 * method NOT NULL) aborta la transacción entera en Postgres: el captureMessage
 * corre igual, pero el COMMIT falla después y la reserva se pierde. Los guards
 * del caller (`depositAmount > 0`, `input.depositMethod` presente) NO son
 * redundancia defensiva: son la única razón por la que "una seña mal formada
 * nunca te hace perder la reserva" es cierto.
 *
 * `occurredAt` queda en "ahora" (default de `createCashFlow`), no en
 * `input.date`: una reserva cargada hoy para el sábado imputa la plata a HOY,
 * que es cuando el staff la cobró de verdad. Contraintuitivo pero correcto —
 * la caja del sábado no puede recibir plata que entró el miércoles.
 */
async function recordManualBookingDepositCashFlow(
  booking: BookingRow,
  method: PaymentMethodValue,
  staffUserId: string,
  tenantId: string,
  tx: DbTx,
): Promise<void> {
  try {
    await createCashFlow(
      tenantId,
      staffUserId,
      {
        type: 'income',
        category: 'booking',
        amount: booking.depositAmount,
        method,
        // El literal EXACTO: `getBookingCharges` y `sumBookingChargesByBooking`
        // excluyen esta fila por match de string para no contar la seña dos
        // veces (una por `depositCounted`, otra por los cobros de mostrador).
        // Cualquier otra descripción infla el "cobrado" del turno y desactiva
        // la alarma "Sin cobrar" de la grilla.
        description: depositCashFlowDescription(booking.id),
        bookingId: booking.id,
      },
      tx,
    )
  } catch (err) {
    if (err instanceof DayAlreadyClosedError) {
      captureMessage('manual booking deposit cash_flow skipped: cash register already closed', {
        level: 'warning',
        extra: { bookingId: booking.id, tenantId, method },
      })
      // Los ids se descartan a propósito: el sweep por cron de send-email
      // levanta las notificaciones en `queued`, igual que hace
      // `createOnlineBooking` acá abajo. Despacharlas post-commit sería
      // latencia, no corrección, y obligaría a cambiar el tipo de retorno de
      // `createManualBooking` (que 6+ tests y `bookingResponseSchema`
      // —z.strictObject— dan por fijo).
      await enqueueTenantOwnerNotification(
        {
          tenantId,
          templateName: 'admin_deposit_after_close',
          content: {
            bookingId: booking.id,
            amountArs: formatArs(booking.depositAmount),
            method,
          },
          triggerEvent: 'payment.deposit_after_close',
        },
        tx,
      )
      return
    }
    captureMessage('manual booking deposit cash_flow skipped: unexpected error recording it', {
      level: 'warning',
      extra: {
        bookingId: booking.id,
        tenantId,
        method,
        error: err instanceof Error ? err.message : String(err),
      },
    })
  }
}

// ─── createOnlineBooking (Flujo 2) ──────────────────────────────────
// With deposit: status='pending_payment', deposit_status='pending', payment_method=null
// (migration 009 allows this; P10 sets payment_method='mercadopago' + payment_id).
// Without deposit: status='confirmed', deposit_status='not_required'.
// Always upserts player_tenant_relationships and checks for active bans.
export async function createOnlineBooking(
  tenantId: string,
  input: CreateOnlineBookingInput,
  tx: DbTx,
): Promise<BookingRow> {
  // Span wraps the whole create so it covers every caller (player API route,
  // reserve server action, e2e route) and groups under `booking.create` in
  // Sentry Performance alongside the existing booking breadcrumbs.
  return withSpan('booking.create.online', 'booking.create', () =>
    createOnlineBookingImpl(tenantId, input, tx),
  )
}

async function createOnlineBookingImpl(
  tenantId: string,
  input: CreateOnlineBookingInput,
  tx: DbTx,
): Promise<BookingRow> {
  // Date window validation (pure, before any DB call).
  if (!isValidCalendarDate(input.date)) {
    throw new BookingDateOutOfRangeError('past_date')
  }
  // Tarea #6: las reservas online son siempre de 60 minutos.
  assertSlotDuration(input.timeStart, input.timeEnd)
  const todayStr = artTodayStr()
  if (input.date < todayStr) {
    // caza-bugs #13: el día operativo de AYER puede seguir físicamente
    // vigente hoy de madrugada si el complejo cierra después de medianoche
    // (closes_next_day) — el slot 01:00 de "ayer operativo" ocurre HOY
    // calendario, todavía en el futuro. Sin esto, todo booking con
    // input.date=ayer se rechazaba como past_date sin importar la hora real.
    const isYesterdayOperating = input.date === addDays(todayStr, -1)
    const physicallyToday =
      isYesterdayOperating &&
      (await slotIsPhysicallyNextDay(tenantId, input.date, input.timeStart, tx))
    if (!physicallyToday) {
      throw new BookingDateOutOfRangeError('past_date')
    }
    // El slot físico cae en el calendario de HOY (no en `input.date`) — comparar
    // la hora de pared contra HOY, no contra el día operativo de ayer.
    const slotStartMs = artDateAt(todayStr, input.timeStart).getTime()
    if (slotStartMs <= Date.now()) {
      throw new BookingDateOutOfRangeError('past_slot')
    }
  } else if (input.date === todayStr) {
    const slotStartMs = artDateAt(input.date, input.timeStart).getTime()
    if (slotStartMs <= Date.now()) {
      // Día operativo: un slot de madrugada del día operativo de hoy ocurre
      // físicamente mañana, así que no está vencido aunque su hora de pared ya
      // pasó. Solo entonces toleramos el slot "pasado".
      const physicallyTomorrow = await slotIsPhysicallyNextDay(
        tenantId,
        input.date,
        input.timeStart,
        tx,
      )
      if (!physicallyTomorrow) {
        throw new BookingDateOutOfRangeError('past_slot')
      }
    }
  }
  if (input.maxAdvanceDays !== undefined && input.date > addDays(todayStr, input.maxAdvanceDays)) {
    throw new BookingDateOutOfRangeError('advance_exceeded')
  }

  track.booking('booking.online.create.start', {
    tenantId,
    courtId: input.courtId,
    playerId: input.playerId,
  })

  // checkPlayerBanned cubre tanto bans manuales del complejo como el softban
  // automático por ausencias reiteradas (applyNoShowStrike inserta en
  // tenant_player_bans, ver booking.cancellation.ts:handleNoShow).
  const banResult = await checkPlayerBanned(input.playerId, tenantId, tx)
  if (banResult.banned) {
    throw new PlayerBannedError(
      input.playerId,
      tenantId,
      banResult.bannedGlobal,
      banResult.reason,
      banResult.until,
    )
  }

  // INV-ABUSE-001: tope duro de holds activos (pending_payment) sin pagar
  // por jugador+tenant. Advisory lock (mismo patrón que
  // autoCompleteOverdueBookings) serializa intentos concurrentes del MISMO
  // jugador+tenant dentro de la tx, cerrando la ventana entre el COUNT y el
  // INSERT — sin esto, dos requests simultáneas podrían colar N+1 holds.
  const holdLockKey = `hold_limit:${tenantId}:${input.playerId}`
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${holdLockKey}))`)
  const activeHoldsRows = (await tx.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM bookings
    WHERE tenant_id = ${tenantId}
      AND player_id = ${input.playerId}
      AND status = 'pending_payment'
  `)) as unknown as Array<{ count: number }>
  const activeHoldsCount = activeHoldsRows[0]?.count ?? 0
  if (activeHoldsCount >= MAX_ACTIVE_HOLDS_PER_PLAYER) {
    track.booking('booking.online.create.too_many_holds', {
      tenantId,
      playerId: input.playerId,
    })
    throw new TooManyActiveHoldsError(input.playerId, tenantId, activeHoldsCount)
  }

  const court = await lockCourtOrThrow(input.courtId, tx)
  if (court.tenantId !== tenantId) {
    throw new CourtOfflineError(input.courtId)
  }

  const calc = calculatePrice(
    court.pricing,
    artDateAt(input.date, input.timeStart),
  )
  if (calc === null) throw new PriceUnavailableError()
  const priceSnapshot = calc

  const physicallyNextDay = await slotIsPhysicallyNextDay(
    tenantId, input.date, input.timeStart, tx,
  )
  const { startsAt, endsAt } = physicalRange({
    date: input.date, timeStart: input.timeStart, timeEnd: input.timeEnd, physicallyNextDay,
  })

  await checkOverlapOrThrow(input.courtId, startsAt, endsAt, tx)

  const withDeposit = input.requiresDeposit && input.depositPercentage > 0
  const depositAmount = withDeposit
    ? calcDepositCents(priceSnapshot, input.depositPercentage)
    : 0

  try {
    const inserted = await tx
      .insert(bookings)
      .values({
        tenantId,
        courtId: input.courtId,
        playerId: input.playerId,
        date: new Date(`${input.date}T00:00:00Z`),
        timeStart: input.timeStart,
        timeEnd: input.timeEnd,
        startsAt,
        endsAt,
        type: 'spontaneous',
        status: withDeposit ? 'pending_payment' : 'confirmed',
        priceSnapshot,
        depositAmount,
        depositStatus: withDeposit ? 'pending' : 'not_required',
        paymentMethod: withDeposit ? null : (input.paymentMethod ?? null),
        notesPlayer: input.notesPlayer ?? null,
      })
      .returning()

    const booking = rowToBookingRow(inserted[0]!)
    await invalidateAvailSearch(input.date)
    await ensurePTR(input.playerId, tenantId, tx)

    const playerRows = await tx.execute(sql`
      SELECT first_name, phone FROM players WHERE id = ${input.playerId} LIMIT 1
    `) as unknown as Array<{ first_name: string; phone: string | null }>
    const playerFirstName = playerRows[0]?.first_name ?? ''
    const playerPhone = playerRows[0]?.phone ?? undefined

    const tenantRows = await tx.execute(sql`
      SELECT name, address FROM tenants WHERE id = ${tenantId} LIMIT 1
    `) as unknown as Array<{ name: string; address: string }>
    const tenantName = tenantRows[0]?.name ?? ''
    const tenantAddress = tenantRows[0]?.address ?? ''

    const dateFormatted = input.date.split('-').reverse().join('/')
    const timeStart = input.timeStart.slice(0, 5)
    const timeEnd = input.timeEnd.slice(0, 5)

    if (booking.status === 'confirmed') {
      await enqueueNotification(
        {
          tenantId,
          recipientType: 'player',
          recipientId: input.playerId,
          templateName: 'booking_confirmed',
          content: {
            playerFirstName,
            courtName: court.name,
            date: dateFormatted,
            timeStart,
            timeEnd,
            tenantName,
            tenantAddress,
          },
          triggerEvent: 'booking.confirmed',
        },
        tx,
      )
    }

    await enqueueTenantOwnerNotification(
      {
        tenantId,
        templateName: 'admin_new_booking',
        content: {
          courtName: court.name,
          date: dateFormatted,
          timeStart,
          timeEnd,
          playerName: playerFirstName,
          ...(playerPhone ? { playerPhone } : {}),
        },
        triggerEvent: 'booking.admin_new_booking',
      },
      tx,
    )

    track.booking('booking.online.create.success', {
      bookingId: booking.id,
      tenantId: booking.tenantId,
      courtId: booking.courtId,
      playerId: booking.playerId ?? undefined,
    })

    if (booking.status === 'pending_payment') {
      // Hallazgo 1: arm the 6-min expiry timer. Routed through an injectable
      // seam so the test suite never starts a real pg-boss. This send happens
      // inside the still-open tx; a rollback leaves an orphan job that no-ops
      // (race-safe transition) and is also covered by the 5-min sweep.
      await scheduleBookingExpiry(booking.id)
    }

    return booking
  } catch (err) {
    if (isExclusionViolation(err)) {
      track.booking('booking.online.create.slot_taken', {
        tenantId,
        courtId: input.courtId,
        playerId: input.playerId,
      })
      throw new SlotTakenError()
    }
    throw err
  }
}

// ─── completeBooking ────────────────────────────────────────────────
export async function completeBooking(
  bookingId: string,
  actor: 'admin' | 'system',
  tx: DbTx,
  staffUserId?: string,
): Promise<BookingRow> {
  assertTransition('confirmed', 'completed', { actor })

  // B1 audit fix: for admin actor, require that time_end has passed in ART.
  // System actor (autoCompleteOverdueBookings cron) has its own grace-window logic
  // and may legitimately complete bookings without passing through here.
  if (actor === 'admin') {
    const check = await tx.execute(sql`
      SELECT b.ends_at > NOW() AS not_yet_ended
      FROM bookings b
      WHERE b.id = ${bookingId}
    `)
    const row = (check as unknown as Array<{ not_yet_ended: boolean }>)[0]
    if (row?.not_yet_ended) {
      throw new BookingNotYetEndedError(bookingId)
    }
  }

  const rows = await tx
    .update(bookings)
    .set({
      status: 'completed',
      completedByStaff: staffUserId ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'confirmed')))
    .returning()

  if (rows.length === 0) throw new BookingNotInConfirmedError(bookingId)
  const completed = rowToBookingRow(rows[0]!)
  await invalidateAvailSearch(completed.date)
  return completed
}

/**
 * Advisory-lock key for the auto-complete cron. Hashed via `hashtext` into the
 * advisory-lock space (same convention as refresh-mp-tokens.worker).
 */
export const AUTO_COMPLETE_LOCK_KEY = 'auto_complete_bookings'

/**
 * Bulk auto-complete: confirms all bookings whose time_end + 30min has passed.
 * Used by the cron job (Flujo 4D, scenario B). Returns affected rows.
 *
 * Concurrency safety: takes a transaction-scoped advisory lock before the
 * UPDATE so a manual run overlapping the every-30-min schedule can't
 * double-process the same overdue set. The blocking `pg_advisory_xact_lock`
 * is intentional — the
 * job is short, so a second run simply waits and then no-ops on the
 * already-completed rows. The lock auto-releases at tx end.
 */
export async function autoCompleteOverdueBookings(
  tx: DbTx,
  graceMinutes = 30,
): Promise<BookingRow[]> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${AUTO_COMPLETE_LOCK_KEY}))`)

  const rows = await tx.execute(sql`
    UPDATE bookings b
    SET status = 'completed', updated_at = NOW()
    WHERE b.status = 'confirmed'
      AND b.ends_at < NOW() - (${graceMinutes} || ' minutes')::interval
    RETURNING b.*
  `)
  return (rows as unknown as Array<typeof bookings.$inferSelect>).map(
    rowToBookingRow,
  )
}

// ─── markNoShow ─────────────────────────────────────────────────────
export async function markNoShow(
  bookingId: string,
  _staffUserId: string,
  tx: DbTx,
): Promise<BookingRow> {
  // Dos caminos, ambos sólo para admin:
  //   1. confirmed → no_show: flujo normal (requiere ends_at pasado, RI #5).
  //   2. completed → no_show: corrección de 24h (P5). Un admin revierte un turno
  //      mal completado dentro de las 24h de la completación (bookings.updated_at).
  const check = await tx.execute(sql`
    SELECT
      b.status,
      b.ends_at > NOW() AS not_yet_ended,
      (NOW() - b.updated_at) < INTERVAL '24 hours' AS within_correction_window
    FROM bookings b
    WHERE b.id = ${bookingId}
  `)
  const row = (
    check as unknown as Array<{
      status: BookingStatus
      not_yet_ended: boolean
      within_correction_window: boolean
    }>
  )[0]
  if (!row) throw new BookingNotInConfirmedError(bookingId)

  if (row.status === 'completed') {
    // Corrección de 24h. assertTransition gobierna el actor (sólo admin); la
    // ventana la chequeamos acá y el trigger DB la respalda (defensa en profundidad).
    assertTransition('completed', 'no_show', { actor: 'admin' })
    if (!row.within_correction_window) {
      throw new NoShowCorrectionWindowExpiredError(bookingId)
    }
    return applyNoShow(bookingId, 'completed', tx)
  }

  // RI #5 (fase D4, doc6 §3): exige que el turno haya TERMINADO (ends_at
  // pasado), no solo que haya empezado — un turno en curso todavía puede ver
  // llegar al equipo. Usa el instante físico (starts_at/ends_at, migr.
  // 040/041), no date/time_end reconstruido, por los turnos post-medianoche
  // (closes_next_day). Antes exigía solo time_start pasado (B1 audit),
  // permitiendo marcar no-show con hasta 59 min de turno en curso.
  assertTransition('confirmed', 'no_show', { actor: 'admin' })
  if (row.not_yet_ended) {
    throw new NoShowNotYetEndedError(bookingId)
  }
  return applyNoShow(bookingId, 'confirmed', tx)
}

async function applyNoShow(
  bookingId: string,
  fromStatus: 'confirmed' | 'completed',
  tx: DbTx,
): Promise<BookingRow> {
  // Tarea #5: la seña pagada queda para el complejo cuando hay no-show. Se captura
  // en el MISMO UPDATE que la transición: el trigger enforce_booking_invariants_fn
  // bloquea cualquier UPDATE posterior sobre un booking ya en estado terminal, así
  // que una segunda sentencia para tocar deposit_status fallaría.
  const rows = await tx
    .update(bookings)
    .set({
      status: 'no_show',
      depositStatus: sql`CASE WHEN ${bookings.depositStatus} = 'paid' THEN 'captured'::deposit_status ELSE ${bookings.depositStatus} END`,
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, fromStatus)))
    .returning()

  if (rows.length === 0) throw new BookingNotInConfirmedError(bookingId)
  const noShow = rowToBookingRow(rows[0]!)
  await invalidateAvailSearch(noShow.date)
  return noShow
}

// ─── revertNoShow ───────────────────────────────────────────────────
/**
 * Corrección INVERSA de 24h (RI #1, doc6 §3): el admin marcó "No vino" por
 * error y devuelve el turno a `completed` dentro de las 24h de la marca
 * (`bookings.updated_at`). Espejo de la rama completed → no_show de
 * `markNoShow`: la state machine gobierna el actor (sólo admin), la ventana se
 * chequea acá y el trigger `enforce_booking_invariants_fn` (migración 060) la
 * respalda a nivel DB.
 *
 * Sólo hace la TRANSICIÓN. Los efectos de negocio (revertir el strike de
 * `player_tenant_relationships`, levantar el softban auto-creado, audit_logs)
 * los orquesta `handleNoShowRevert` (booking.cancellation.ts), igual que
 * `handleNoShow` envuelve a `markNoShow`.
 *
 * La seña capturada al marcar la ausencia (`deposit_status = 'captured'`) NO se
 * revierte ni se reembolsa automáticamente: no hay forma de saber si el
 * complejo ya la cobró/aplicó al turno, y un refund automático movería plata
 * sin decisión humana. Queda manual entre jugador y complejo (la UI lo avisa).
 */
export async function revertNoShow(
  bookingId: string,
  staffUserId: string,
  tx: DbTx,
): Promise<BookingRow> {
  assertTransition('no_show', 'completed', { actor: 'admin' })

  const check = await tx.execute(sql`
    SELECT
      b.status,
      (NOW() - b.updated_at) < INTERVAL '24 hours' AS within_correction_window
    FROM bookings b
    WHERE b.id = ${bookingId}
  `)
  const row = (
    check as unknown as Array<{
      status: BookingStatus
      within_correction_window: boolean
    }>
  )[0]
  if (!row || row.status !== 'no_show') throw new BookingNotInNoShowError(bookingId)
  if (!row.within_correction_window) throw new NoShowRevertWindowExpiredError(bookingId)

  const rows = await tx
    .update(bookings)
    .set({
      status: 'completed',
      // Migración 047: queda registrado qué staff dejó el turno en 'completed'
      // — acá, quien corrigió la ausencia.
      completedByStaff: staffUserId,
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'no_show')))
    .returning()

  if (rows.length === 0) throw new BookingNotInNoShowError(bookingId)
  const completed = rowToBookingRow(rows[0]!)
  await invalidateAvailSearch(completed.date)
  return completed
}

// ─── expirePendingBooking ───────────────────────────────────────────
export async function expirePendingBooking(
  bookingId: string,
  tx: DbTx,
): Promise<TransitionResult> {
  return transitionFromPendingPayment(bookingId, 'expired', tx)
}

// ─── getAvailableSlots ──────────────────────────────────────────────
export type GenerateSlotsInput = {
  pricing: CourtPricingData
  dayKey: (typeof DAY_KEYS)[number]
  openHhmm: string
  closeHhmm: string
  closedDay: boolean
  // Día operativo: cuando true, un cierre post-medianoche (close <= open) corre
  // a la madrugada del día siguiente y genera los slots 00:00, 01:00… al final.
  closesNextDay?: boolean
  occupied: Array<{ timeStartMins: number; timeEndMins: number }>
}

export function generateSlots(p: GenerateSlotsInput): AvailableSlot[] {
  if (p.closedDay) return []
  const closesNextDay = p.closesNextDay ?? false
  const openMins = timeToMins(p.openHhmm)
  const closeMins = effectiveCloseMins(p.openHhmm, p.closeHhmm, closesNextDay)
  // Las reservas post-medianoche se guardan con la hora de pared chica (00:00,
  // 01:00) pero el día operativo en bookings.date; las llevamos al eje continuo
  // (≥1440) para que solapen con los slots de madrugada.
  const occupied = p.occupied.map((b) => {
    const n = normalizeRangeToOpenDay(b.timeStartMins, b.timeEndMins, openMins, closesNextDay)
    return { timeStartMins: n.startMins, timeEndMins: n.endMins }
  })
  // Tarea #6: turnos de 60 min fijos.
  const lastStart = closeMins - SLOT_DURATION_MINUTES

  const slots: AvailableSlot[] = []
  for (let start = openMins; start <= lastStart; start += SLOT_DURATION_MINUTES) {
    const slotEnd = start + SLOT_DURATION_MINUTES
    const overlaps = occupied.some(
      (b) => start < b.timeEndMins && slotEnd > b.timeStartMins,
    )
    const timeStart = minsToTime(start)
    // El slot que termina en la medianoche calendario se etiqueta '24:00'
    // (> '23:00' → pasa chk_time_valid); las madrugadas vuelven a 01:00, 02:00…
    const timeEnd = endLabelFromMins(slotEnd)
    const price = priceForSlot(p.pricing, p.dayKey, timeStart)
    slots.push({
      timeStart,
      timeEnd,
      price,
      available: !overlaps,
    })
  }
  return slots
}

// El lookup de tarifa vive en `@/lib/booking/pricing` (fuente única compartida
// con calculatePrice y con el popover de alta rápida del cliente).

export async function getAvailableSlots(
  tenantId: string,
  courtId: string,
  dateStr: string,
  tx: DbTx,
): Promise<AvailableSlot[]> {
  const courtRows = await tx
    .select({
      id: courts.id,
      tenantId: courts.tenantId,
      pricing: courts.pricing,
      status: courts.status,
    })
    .from(courts)
    .where(eq(courts.id, courtId))
    .limit(1)

  const court = courtRows[0]
  if (!court || court.status !== 'online' || court.tenantId !== tenantId) {
    return []
  }

  const tenantRows = await tx
    .select({
      openingHours: tenants.openingHours,
      closedDates: tenants.closedDates,
      closesNextDay: tenants.closesNextDay,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const tenant = tenantRows[0]
  if (!tenant) return []

  const [y, mo, d] = dateStr.split('-').map(Number)
  const targetUtc = new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1))
  const dayKey = DAY_KEYS[targetUtc.getUTCDay()]!

  const opening = tenant.openingHours as OpeningHours
  const dayHours = opening[dayKey as keyof OpeningHours]
  const closedDates = (tenant.closedDates ?? []) as string[]
  const closedDay = dayHours?.closed === true || closedDates.includes(dateStr)

  const occupiedRows = await tx
    .select({
      timeStart: bookings.timeStart,
      timeEnd: bookings.timeEnd,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.courtId, courtId),
        sql`${bookings.date} = ${dateStr}::date`,
        sql`${bookings.status} IN ('pending_payment', 'confirmed')`,
      ),
    )

  const occupied = occupiedRows.map((b) => {
    const endMins = timeToMins(b.timeEnd.slice(0, 5))
    return {
      timeStartMins: timeToMins(b.timeStart.slice(0, 5)),
      timeEndMins: endMins === 0 ? 24 * 60 : endMins,
    }
  })

  return generateSlots({
    pricing: court.pricing as CourtPricingData,
    dayKey,
    openHhmm: dayHours?.open ?? '08:00',
    closeHhmm: dayHours?.close ?? '23:00',
    closedDay,
    closesNextDay: tenant.closesNextDay ?? false,
    occupied,
  })
}

// NOTA (B5, 2026-08-09): acá vivía `getAvailableSlotsCached`, la variante
// read-through de `getAvailableSlots`. Se eliminó junto con el cache por-cancha
// que la sostenía: nunca tuvo un caller. Ver el docstring de
// `src/shared/cache/slots-cache.ts` para por qué la forma del cache no le
// servía a su único consumidor plausible (`getPublicAvailability` resuelve
// todas las canchas en una query y ya cachea en el borde).

