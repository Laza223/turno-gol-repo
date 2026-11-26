import { and, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm'
import {
  auditLogs,
  bookings,
  tenants,
  tenantSubscriptions,
  whatsappChats,
} from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { invalidateAvailSearch } from '@/shared/cache/slots-cache'
import { findActiveBanByPhoneHint } from '@/modules/bans/ban.service'
import { generateSlots } from '@/modules/tenants/public.service'
import { isPublicPortalOpen, publicBookingAdvanceDays } from '@/modules/tenants/tenant.lifecycle'
import { bookingMinAdvanceHours } from '@/modules/tenants/tenant.utils'
import type { OpeningHours, TenantSettings } from '@/modules/tenants/tenant.types'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { enqueueBookingStaffNotification } from '@/modules/notifications/booking-staff-notification.service'
import { isStaffNotificationsEnabled } from '@/modules/notifications/staff-notification.service'
import { dayKeyOf } from '@/lib/booking/pricing'
import { captureMessage } from '@/lib/sentry'
import {
  DEFAULT_CANCELLATION_HOURS_BEFORE,
  MAX_WHATSAPP_ACTIVE_HOLDS_PER_CHAT,
  MAX_WHATSAPP_UNPAID_CONFIRMED_PER_CHAT,
  SLOT_DURATION_MINUTES,
} from '@/shared/constants'
import { artNowParts } from '@/shared/dates/art'
import { track, withSpan } from '@/shared/observability'
import { endLabelFromMins, hhmmToMins } from '@/shared/time/operating-day'
import { physicalRange } from '@/shared/time/physical-range'
import { isValidCalendarDate } from '@/shared/validation/calendar-date'
import { hhmm, isUuid } from '@/shared/validation/primitives'
import {
  afterOnlineInsert,
  assertOnlineSlotWindow,
  assertSlotDuration,
  checkOverlapOrThrow,
  isExclusionViolation,
  lockPricedSlot,
  slotIsPhysicallyNextDay,
} from './booking.service'
import {
  BookingDateOutOfRangeError,
  BookingNotOfferedError,
  BookingValidationError,
  CourtOfflineError,
  GuestLateCancelBlockedError,
  PlayerBannedError,
  SlotTakenError,
  TooManyWhatsappBookingsError,
  WhatsappRescheduleBlockedError,
} from './booking.errors'
import { calcDepositCents } from './deposit'
import { guestLateCancelStatus, PHONE_HINT_DIGITS } from './guest-late-cancel'
import { rowToBookingRow } from './booking.mappers'
import type { BookingRow } from './booking.types'

/**
 * Reserva del bot de WhatsApp: un invitado SIN cuenta, identificado por su chat
 * (`whatsapp_chats`). Decisión: docs/decisions/2026-10-20-bot-whatsapp.md.
 */
export type CreateWhatsappBookingInput = {
  /** `whatsapp_chats.id` del chat donde se pidió el turno. Lo fija el servidor, no el modelo. */
  chatId: string
  courtId: string
  /** Día OPERATIVO del turno, YYYY-MM-DD (`bookings.date`). */
  date: string
  /** Hora de inicio, HH:MM. El turno dura `SLOT_DURATION_MINUTES`. */
  timeStart: string
  guestName: string
  /** Solo dígitos (`^\d{8,15}$`), como lo manda Meta. */
  guestPhone: string
}

export type CreateWhatsappBookingResult = {
  booking: BookingRow
  /** `true` = quedó en `pending_payment`: el caller tiene que generar el link de la seña. */
  requiresPayment: boolean
  /** `true` = la reserva ya existía para este chat y este turno (reintento del job). */
  alreadyExisted: boolean
}

const PHONE_RE = /^\d{8,15}$/
const GUEST_NAME_MAX = 80

export async function createWhatsappBooking(
  tenantId: string,
  input: CreateWhatsappBookingInput,
  tx: DbTx,
): Promise<CreateWhatsappBookingResult> {
  return withSpan('booking.create.whatsapp', 'booking.create', () =>
    createWhatsappBookingImpl(tenantId, input, tx),
  )
}

async function createWhatsappBookingImpl(
  tenantId: string,
  input: CreateWhatsappBookingInput,
  tx: DbTx,
): Promise<CreateWhatsappBookingResult> {
  // ── Forma de la entrada. El modelo elige cancha/fecha/hora/nombre: nada de esto
  // se confía. Un id que no es UUID haría fallar el cast en Postgres.
  if (!isUuid(input.chatId)) throw new BookingValidationError('Chat inválido.')
  if (!isUuid(input.courtId)) throw new CourtOfflineError(input.courtId)
  if (!isValidCalendarDate(input.date)) throw new BookingDateOutOfRangeError('past_date')
  if (!hhmm.safeParse(input.timeStart).success) {
    throw new BookingValidationError('Hora inválida.')
  }
  const guestName = input.guestName.trim()
  if (guestName.length === 0 || guestName.length > GUEST_NAME_MAX) {
    throw new BookingValidationError('Nombre inválido.')
  }
  if (!PHONE_RE.test(input.guestPhone)) throw new BookingValidationError('Teléfono inválido.')
  const timeEnd = endLabelFromMins(hhmmToMins(input.timeStart) + SLOT_DURATION_MINUTES)

  // ── Advisory lock por chat (mismo patrón que el tope de holds por jugador de
  // `createOnlineBooking`): serializa los intentos del MISMO chat dentro de la tx,
  // así que ni el reintento idempotente ni los topes pueden racear. Va ANTES del
  // lock de la cancha (`lockPricedSlot`), igual que en el portal.
  const chatLockKey = `wa_chat:${tenantId}:${input.chatId}`
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${chatLockKey}))`)

  // El chat tiene que ser de ESTE complejo: la FK sola aceptaría el de otro.
  const chatRows = await tx
    .select({ id: whatsappChats.id })
    .from(whatsappChats)
    .where(and(eq(whatsappChats.id, input.chatId), eq(whatsappChats.tenantId, tenantId)))
    .limit(1)
  if (chatRows.length === 0) throw new BookingValidationError('Chat inválido.')

  // ── Idempotencia: el job del bot se reintenta, y el segundo intento no puede
  // chocar con el exclusion constraint contra la reserva que él mismo creó.
  const physicallyNextDay = await slotIsPhysicallyNextDay(tenantId, input.date, input.timeStart, tx)
  const { startsAt } = physicalRange({
    date: input.date,
    timeStart: input.timeStart,
    timeEnd,
    physicallyNextDay,
  })
  const existingRows = await tx
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, tenantId),
        eq(bookings.whatsappChatId, input.chatId),
        eq(bookings.courtId, input.courtId),
        eq(bookings.startsAt, startsAt),
        inArray(bookings.status, ['pending_payment', 'confirmed']),
      ),
    )
    .limit(1)
  if (existingRows[0]) {
    const existing = rowToBookingRow(existingRows[0])
    return {
      booking: existing,
      requiresPayment: existing.status === 'pending_payment',
      alreadyExisted: true,
    }
  }

  // ── Complejo: portal abierto y con reservas online. `tenants` es global (sin RLS).
  const { tenant, settings, canceledPeriodEnd } = await loadActivePortalTenant(tenantId, tx)

  // ── Las reglas del portal + horario del complejo (día cerrado, `closed_dates`, apertura).
  await assertSlotWindowOffered(
    tenantId,
    tenant,
    settings,
    canceledPeriodEnd,
    { courtId: input.courtId, date: input.date, timeStart: input.timeStart, timeEnd },
    tx,
  )

  // ── Ban y cancelaciones tardías por teléfono.
  await assertGuestNotBanned(tenantId, input.guestPhone, tx)

  // ── Topes por CHAT (no por teléfono: el staff puede editarlo en la reserva).
  const capRows = (await tx.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending_payment')::int AS holds,
      COUNT(*) FILTER (
        WHERE status = 'confirmed' AND deposit_status = 'not_required' AND starts_at > NOW()
      )::int AS unpaid
    FROM bookings
    WHERE tenant_id = ${tenantId}
      AND whatsapp_chat_id = ${input.chatId}
  `)) as unknown as Array<{ holds: number; unpaid: number }>
  const activeHolds = capRows[0]?.holds ?? 0
  const unpaidConfirmed = capRows[0]?.unpaid ?? 0
  if (activeHolds >= MAX_WHATSAPP_ACTIVE_HOLDS_PER_CHAT) {
    track.booking('booking.online.create.too_many_holds', { tenantId })
    throw new TooManyWhatsappBookingsError(input.chatId, tenantId, 'holds', activeHolds)
  }
  if (unpaidConfirmed >= MAX_WHATSAPP_UNPAID_CONFIRMED_PER_CHAT) {
    throw new TooManyWhatsappBookingsError(
      input.chatId,
      tenantId,
      'unpaid_confirmed',
      unpaidConfirmed,
    )
  }

  // ── Cancha + precio + turno libre.
  const slot = await lockPricedSlot(
    tenantId,
    {
      courtId: input.courtId,
      date: input.date,
      timeStart: input.timeStart,
      timeEnd,
      minLeadMinutes: bookingMinAdvanceHours(settings) * 60,
    },
    tx,
  )
  await checkOverlapOrThrow(input.courtId, slot.startsAt, slot.endsAt, tx)

  // ── Seña: la decisión de `createBookingAndCheckout` (reservar/actions.ts). Un complejo con
  // `requires_deposit` y MercadoPago SIN conectar no puede cobrar la seña, así que
  // la reserva se confirma sin seña (decisión del dueño, 2026-08-18) en vez de nacer
  // `pending_payment` y vencer sola. Igual con MP marcado como desconectado (migr. 100,
  // decisión 2026-10-22): sin reporte, el dueño ya tiene el aviso en Hoy.
  const depositUnpayable =
    settings.requires_deposit && (!tenant.mpAccessToken || !!tenant.mpDisconnectedAt)
  if (settings.requires_deposit && !tenant.mpAccessToken) {
    captureMessage('whatsapp booking: requires_deposit sin MercadoPago conectado', 'warning')
  }
  const withDeposit =
    settings.requires_deposit && !depositUnpayable && settings.deposit_percentage > 0
  const depositAmount = withDeposit
    ? calcDepositCents(slot.priceSnapshot, settings.deposit_percentage)
    : 0

  try {
    const inserted = await tx
      .insert(bookings)
      .values({
        tenantId,
        courtId: input.courtId,
        // Reserva de invitado: sin cuenta (`player_id`) y sin staff.
        playerId: null,
        createdByStaff: null,
        date: new Date(`${input.date}T00:00:00Z`),
        timeStart: input.timeStart,
        timeEnd,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        type: 'spontaneous',
        status: withDeposit ? 'pending_payment' : 'confirmed',
        priceSnapshot: slot.priceSnapshot,
        depositAmount,
        depositStatus: withDeposit ? 'pending' : 'not_required',
        paymentMethod: null,
        guestName,
        guestPhone: input.guestPhone,
        whatsappChatId: input.chatId,
      })
      .returning()
    const booking = rowToBookingRow(inserted[0]!)

    // Aviso al admin: el mismo mail que la reserva online. El push sale del caller
    // (whatsapp-bot.tools.ts), ya commiteada la tx.
    if (await isStaffNotificationsEnabled(tenantId, tx)) {
      if (booking.status === 'confirmed') {
        await enqueueBookingStaffNotification(tenantId, booking.id, 'confirmed', tx)
      }
    } else {
      await enqueueTenantOwnerNotification(
        {
          tenantId,
          templateName: 'admin_new_booking',
          content: {
            courtName: slot.court.name,
            // Operativo (`input.date`), igual que en el portal.
            date: input.date.split('-').reverse().join('/'),
            timeStart: input.timeStart,
            timeEnd: timeEnd.slice(0, 5),
            playerName: guestName,
            playerPhone: input.guestPhone,
          },
          triggerEvent: 'booking.admin_new_booking',
        },
        tx,
      )
    }

    await afterOnlineInsert(
      booking,
      { date: input.date, onboardingCompletedAt: settings.onboarding_completed_at },
      tx,
    )

    return { booking, requiresPayment: booking.status === 'pending_payment', alreadyExisted: false }
  } catch (err) {
    if (isExclusionViolation(err)) {
      track.booking('booking.online.create.slot_taken', { tenantId, courtId: input.courtId })
      throw new SlotTakenError()
    }
    throw err
  }
}

async function loadActivePortalTenant(tenantId: string, tx: DbTx) {
  const tenantRows = await tx
    .select({
      status: tenants.status,
      settings: tenants.settings,
      openingHours: tenants.openingHours,
      closedDates: tenants.closedDates,
      closesNextDay: tenants.closesNextDay,
      mpAccessToken: tenants.mpAccessToken,
      mpDisconnectedAt: tenants.mpDisconnectedAt,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const tenant = tenantRows[0]
  if (!tenant) throw new BookingNotOfferedError('portal_closed')
  const settings = tenant.settings as TenantSettings

  const canceledPeriodEnd =
    tenant.status === 'canceled'
      ? await tx
          .select({ currentPeriodEnd: tenantSubscriptions.currentPeriodEnd })
          .from(tenantSubscriptions)
          .where(eq(tenantSubscriptions.tenantId, tenantId))
          .limit(1)
          .then((r) => r[0]?.currentPeriodEnd ?? null)
      : null
  if (!isPublicPortalOpen(tenant.status, canceledPeriodEnd)) {
    throw new BookingNotOfferedError('portal_closed')
  }
  if (settings.allow_online_booking === false) throw new BookingNotOfferedError('online_disabled')

  return { tenant, settings, canceledPeriodEnd }
}

type ActivePortalTenant = Awaited<ReturnType<typeof loadActivePortalTenant>>

async function assertSlotWindowOffered(
  tenantId: string,
  tenant: ActivePortalTenant['tenant'],
  settings: TenantSettings,
  canceledPeriodEnd: Date | null,
  params: { courtId: string; date: string; timeStart: string; timeEnd: string },
  tx: DbTx,
) {
  await assertOnlineSlotWindow(
    tenantId,
    {
      date: params.date,
      timeStart: params.timeStart,
      timeEnd: params.timeEnd,
      maxAdvanceDays: publicBookingAdvanceDays(
        settings.booking_advance_days ?? 6,
        tenant.status,
        canceledPeriodEnd,
      ),
    },
    tx,
  )

  const openingHours = tenant.openingHours as OpeningHours
  const dayKey = dayKeyOf(params.date)
  const dayHours = openingHours[dayKey as keyof OpeningHours]
  const closedDay = dayHours?.closed === true || (tenant.closedDates ?? []).includes(params.date)
  if (closedDay) throw new BookingNotOfferedError('closed_day')
  const now = artNowParts()
  const offered = generateSlots({
    courtId: params.courtId,
    pricing: { rules: [] },
    dayKey,
    openHhmm: dayHours?.open ?? '08:00',
    closeHhmm: dayHours?.close ?? '23:00',
    closedDay,
    closesNextDay: tenant.closesNextDay,
    courtBookings: [],
    durationMins: SLOT_DURATION_MINUTES,
    date: params.date,
    nowDateStr: now.date,
    nowMins: hhmmToMins(now.time),
  }).some((slot) => slot.time === params.timeStart)
  if (!offered) throw new BookingNotOfferedError('outside_hours')
}

async function assertGuestNotBanned(tenantId: string, guestPhone: string, tx: DbTx) {
  const hint = guestPhone.slice(-PHONE_HINT_DIGITS)
  const ban = await findActiveBanByPhoneHint(tenantId, hint, tx)
  if (ban) throw new PlayerBannedError(ban.playerId, tenantId, false, ban.reason, ban.until)

  const late = await guestLateCancelStatus(tenantId, hint, tx)
  if (late.bannedUntil) throw new GuestLateCancelBlockedError(late.bannedUntil)
}

export type RescheduleWhatsappBookingInput = {
  chatId: string
  fromCourtId: string
  fromDate: string
  fromTimeStart: string
  toCourtId: string
  toDate: string
  toTimeStart: string
  now?: Date
}

export type RescheduleWhatsappBookingResult = {
  booking: BookingRow
  from: { courtId: string; date: string; timeStart: string }
  priceChanged: boolean
}

/**
 * Reprograma un turno confirmado y sin seña de este chat conservando el mismo `booking.id`.
 * Respeta las horas de anticipación configuradas por el complejo para cancelación y limita a
 * 1 reprogramación por reserva desde WhatsApp para prevenir abusos.
 */
export async function rescheduleWhatsappBooking(
  tenantId: string,
  input: RescheduleWhatsappBookingInput,
  tx: DbTx,
): Promise<RescheduleWhatsappBookingResult> {
  return withSpan('booking.reschedule.whatsapp', 'booking.reschedule', () =>
    rescheduleWhatsappBookingImpl(tenantId, input, tx),
  )
}

async function rescheduleWhatsappBookingImpl(
  tenantId: string,
  input: RescheduleWhatsappBookingInput,
  tx: DbTx,
): Promise<RescheduleWhatsappBookingResult> {
  if (!isUuid(input.chatId)) throw new BookingValidationError('Chat inválido.')
  if (!isUuid(input.fromCourtId)) throw new CourtOfflineError(input.fromCourtId)
  if (!isUuid(input.toCourtId)) throw new CourtOfflineError(input.toCourtId)
  if (!isValidCalendarDate(input.fromDate) || !isValidCalendarDate(input.toDate)) {
    throw new BookingDateOutOfRangeError('past_date')
  }
  if (!hhmm.safeParse(input.fromTimeStart).success || !hhmm.safeParse(input.toTimeStart).success) {
    throw new BookingValidationError('Hora inválida.')
  }
  if (
    input.fromCourtId === input.toCourtId &&
    input.fromDate === input.toDate &&
    input.fromTimeStart === input.toTimeStart
  ) {
    throw new WhatsappRescheduleBlockedError(null, 'same_slot')
  }

  const toTimeEnd = endLabelFromMins(hhmmToMins(input.toTimeStart) + SLOT_DURATION_MINUTES)

  const chatLockKey = `wa_chat:${tenantId}:${input.chatId}`
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${chatLockKey}))`)

  const chatRows = await tx
    .select({ id: whatsappChats.id })
    .from(whatsappChats)
    .where(and(eq(whatsappChats.id, input.chatId), eq(whatsappChats.tenantId, tenantId)))
    .limit(1)
  if (chatRows.length === 0) throw new BookingValidationError('Chat inválido.')

  const { tenant, settings, canceledPeriodEnd } = await loadActivePortalTenant(tenantId, tx)

  await assertSlotWindowOffered(
    tenantId,
    tenant,
    settings,
    canceledPeriodEnd,
    {
      courtId: input.toCourtId,
      date: input.toDate,
      timeStart: input.toTimeStart,
      timeEnd: toTimeEnd,
    },
    tx,
  )

  // Orden de locks consistente con `rescheduleBooking`: cancha destino antes del booking.
  const slot = await lockPricedSlot(
    tenantId,
    {
      courtId: input.toCourtId,
      date: input.toDate,
      timeStart: input.toTimeStart,
      timeEnd: toTimeEnd,
      minLeadMinutes: bookingMinAdvanceHours(settings) * 60,
    },
    tx,
  )

  const foundRows = await tx
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, tenantId),
        eq(bookings.whatsappChatId, input.chatId),
        eq(bookings.courtId, input.fromCourtId),
        sql`${bookings.date} = ${input.fromDate}::date`,
        sql`to_char(${bookings.timeStart}, 'HH24:MI') = ${input.fromTimeStart}`,
        inArray(bookings.status, ['confirmed', 'pending_payment']),
      ),
    )
    .for('update')
    .limit(1)
  const booking = foundRows[0]
  if (!booking) throw new WhatsappRescheduleBlockedError(null, 'not_found')

  if (booking.status === 'pending_payment' || booking.depositStatus === 'pending') {
    throw new WhatsappRescheduleBlockedError(booking.id, 'deposit_pending')
  }
  if (booking.status !== 'confirmed') {
    throw new WhatsappRescheduleBlockedError(booking.id, 'not_found')
  }
  if (booking.depositStatus !== 'not_required') {
    throw new WhatsappRescheduleBlockedError(booking.id, 'deposit_paid')
  }
  if (booking.type === 'fixed' || booking.type === 'tournament' || booking.type === 'block') {
    throw new WhatsappRescheduleBlockedError(booking.id, 'not_supported')
  }
  try {
    assertSlotDuration(booking.timeStart.slice(0, 5), booking.timeEnd.slice(0, 5))
  } catch {
    throw new WhatsappRescheduleBlockedError(booking.id, 'not_supported')
  }

  const nowMs = (input.now ?? new Date()).getTime()
  if (booking.startsAt.getTime() <= nowMs) {
    throw new WhatsappRescheduleBlockedError(booking.id, 'already_started')
  }

  const minHoursBefore = settings.requires_deposit
    ? (settings.cancellation_policy?.hours_before ?? DEFAULT_CANCELLATION_HOURS_BEFORE)
    : (settings.late_cancel_hours ?? 0)
  if (minHoursBefore > 0 && booking.startsAt.getTime() - nowMs < minHoursBefore * 3_600_000) {
    throw new WhatsappRescheduleBlockedError(booking.id, 'too_close', minHoursBefore)
  }

  const priorReschedules = await tx
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.tenantId, tenantId),
        eq(auditLogs.resourceType, 'booking'),
        eq(auditLogs.resourceId, booking.id),
        eq(auditLogs.action, 'booking.rescheduled'),
      ),
    )
    .limit(1)
  if (priorReschedules.length > 0) {
    throw new WhatsappRescheduleBlockedError(booking.id, 'reschedule_limit')
  }

  if (booking.guestPhone) {
    await assertGuestNotBanned(tenantId, booking.guestPhone, tx)
  }

  const conflictRows = await tx
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.courtId, input.toCourtId),
        ne(bookings.id, booking.id),
        inArray(bookings.status, ['pending_payment', 'confirmed']),
        lt(bookings.startsAt, slot.endsAt),
        gt(bookings.endsAt, slot.startsAt),
      ),
    )
    .limit(1)
  if (conflictRows.length > 0) throw new SlotTakenError()

  let updatedRow
  try {
    const rows = await tx
      .update(bookings)
      .set({
        courtId: input.toCourtId,
        date: new Date(`${input.toDate}T00:00:00Z`),
        timeStart: input.toTimeStart,
        timeEnd: toTimeEnd,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        priceSnapshot: slot.priceSnapshot,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id))
      .returning()
    updatedRow = rows[0]!
  } catch (err) {
    if (isExclusionViolation(err)) {
      track.booking('booking.online.create.slot_taken', {
        tenantId,
        courtId: input.toCourtId,
      })
      throw new SlotTakenError()
    }
    throw err
  }

  await invalidateAvailSearch(input.fromDate)
  if (input.toDate !== input.fromDate) {
    await invalidateAvailSearch(input.toDate)
  }

  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'booking.rescheduled',
    resourceType: 'booking',
    resourceId: booking.id,
    metadata: {
      source: 'whatsapp_bot',
      chatId: input.chatId,
      fromCourtId: booking.courtId,
      fromDate: input.fromDate,
      fromTimeStart: input.fromTimeStart,
      toCourtId: input.toCourtId,
      toDate: input.toDate,
      toTimeStart: input.toTimeStart,
      oldPrice: booking.priceSnapshot,
      newPrice: slot.priceSnapshot,
    },
  })

  return {
    booking: rowToBookingRow(updatedRow),
    from: {
      courtId: booking.courtId,
      date: input.fromDate,
      timeStart: input.fromTimeStart,
    },
    priceChanged: slot.priceSnapshot !== booking.priceSnapshot,
  }
}
