import { and, eq, inArray, sql } from 'drizzle-orm'
import { bookings, tenants, tenantSubscriptions, whatsappChats } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { findActiveBanByPhoneHint } from '@/modules/bans/ban.service'
import { generateSlots } from '@/modules/tenants/public.service'
import { isPublicPortalOpen, publicBookingAdvanceDays } from '@/modules/tenants/tenant.lifecycle'
import { bookingMinAdvanceHours } from '@/modules/tenants/tenant.utils'
import type { OpeningHours, TenantSettings } from '@/modules/tenants/tenant.types'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { dayKeyOf } from '@/lib/booking/pricing'
import { captureMessage } from '@/lib/sentry'
import {
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
  const tenantRows = await tx
    .select({
      status: tenants.status,
      settings: tenants.settings,
      openingHours: tenants.openingHours,
      closedDates: tenants.closedDates,
      closesNextDay: tenants.closesNextDay,
      mpAccessToken: tenants.mpAccessToken,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const tenant = tenantRows[0]
  if (!tenant) throw new BookingNotOfferedError('portal_closed')
  const settings = tenant.settings as TenantSettings

  // Mismo cálculo que `getPublicTenant`: el período pago solo se lee en la baja voluntaria.
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

  // ── Las reglas del portal: 60 min, no vencido, anticipación máxima y período pago.
  await assertOnlineSlotWindow(
    tenantId,
    {
      date: input.date,
      timeStart: input.timeStart,
      timeEnd,
      maxAdvanceDays: publicBookingAdvanceDays(
        settings.booking_advance_days ?? 6,
        tenant.status,
        canceledPeriodEnd,
      ),
    },
    tx,
  )

  // ── Horario del complejo: lo que el portal ya filtra al dibujar la grilla y
  // `createOnlineBooking` NO revalida (día cerrado, `closed_dates`, fuera de horario).
  // Se pregunta a `generateSlots`, el mismo generador de la disponibilidad pública, si
  // la hora existe en la grilla de ese día: toda la aritmética del día operativo
  // (cierre post-medianoche, madrugada) queda de su lado.
  const openingHours = tenant.openingHours as OpeningHours
  const dayKey = dayKeyOf(input.date)
  const dayHours = openingHours[dayKey as keyof OpeningHours]
  // Igual que `getPublicAvailabilityImpl` (public.service.ts): día cerrado de la
  // semana o fecha puntual cerrada.
  const closedDay = dayHours?.closed === true || (tenant.closedDates ?? []).includes(input.date)
  if (closedDay) throw new BookingNotOfferedError('closed_day')
  const now = artNowParts()
  const offered = generateSlots({
    courtId: input.courtId,
    // Solo importa QUÉ horas hay, no su precio ni su estado: sin reglas y sin reservas.
    pricing: { rules: [] },
    dayKey,
    openHhmm: dayHours?.open ?? '08:00',
    closeHhmm: dayHours?.close ?? '23:00',
    closedDay,
    closesNextDay: tenant.closesNextDay,
    courtBookings: [],
    durationMins: SLOT_DURATION_MINUTES,
    date: input.date,
    nowDateStr: now.date,
    nowMins: hhmmToMins(now.time),
  }).some((slot) => slot.time === input.timeStart)
  if (!offered) throw new BookingNotOfferedError('outside_hours')

  // ── Ban: el mismo mecanismo que el portal (`tenant_player_bans`: manuales y softban de
  // ausencias), cruzado por teléfono porque el invitado no tiene `player_id`.
  const ban = await findActiveBanByPhoneHint(
    tenantId,
    input.guestPhone.slice(-PHONE_HINT_DIGITS),
    tx,
  )
  if (ban) throw new PlayerBannedError(ban.playerId, tenantId, false, ban.reason, ban.until)

  // Cancelaciones tardías del invitado: se derivan de sus reservas (no hay fila de ban).
  const late = await guestLateCancelStatus(tenantId, input.guestPhone.slice(-PHONE_HINT_DIGITS), tx)
  if (late.bannedUntil) throw new GuestLateCancelBlockedError(late.bannedUntil)

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
  // `pending_payment` y vencer sola.
  const depositUnpayable = settings.requires_deposit && !tenant.mpAccessToken
  if (depositUnpayable) {
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

    // Aviso al admin: el mismo mail que la reserva online (sin push nuevo).
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
