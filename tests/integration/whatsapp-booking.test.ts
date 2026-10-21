import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { faker } from '@faker-js/faker'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  createWhatsappBooking,
  type CreateWhatsappBookingInput,
} from '@/modules/bookings/booking.whatsapp'
import {
  BookingDateOutOfRangeError,
  BookingNotOfferedError,
  BookingValidationError,
  CourtOfflineError,
  PlayerBannedError,
  SlotTakenError,
  TooManyWhatsappBookingsError,
} from '@/modules/bookings/booking.errors'
import { createDepositPayment } from '@/modules/payments/payment.service'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { setExpiryScheduler } from '@/shared/jobs/schedule-expiry'
import { dayKeyOf } from '@/lib/booking/pricing'
import { addDays, artTodayStr } from '@/shared/dates/art'
import {
  MAX_WHATSAPP_ACTIVE_HOLDS_PER_CHAT,
  MAX_WHATSAPP_UNPAID_CONFIRMED_PER_CHAT,
} from '@/shared/constants'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'
import { insertBan, insertBooking, insertWhatsappChat } from '../helpers/factories'

/**
 * `createWhatsappBooking` (booking.whatsapp.ts): la reserva del bot de WhatsApp,
 * de un invitado sin cuenta identificado por su chat. Todas las fechas son
 * relativas a HOY (ART) y los complejos de prueba tienen `booking_advance_days`
 * holgado: la ventana de anticipación del portal también rige acá.
 */

const PRICE = 800_000
const DATE = addDays(artTodayStr(), 3)
const APP_URL = 'https://turnogol.app'

const BASE_SETTINGS = {
  requires_deposit: false,
  deposit_percentage: 30,
  cancellation_policy: { hours_before: 12, penalty_type: 'deposit', penalty_amount: null },
  accepts_cash: true,
  accepts_transfer: true,
  accepts_mercadopago: true,
  allow_online_booking: true,
  booking_advance_days: 30,
  auto_complete_minutes: 30,
  onboarding_completed: true,
}

type DayHours = { open: string; close: string; closed?: boolean }
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
function weekOf(day: DayHours): Record<string, DayHours> {
  return Object.fromEntries(DAY_KEYS.map((k) => [k, day]))
}
const OPEN_8_TO_23: DayHours = { open: '08:00', close: '23:00' }

type Seed = {
  tenantId: string
  courtId: string
  chatId: string
  /** Solo dígitos, como lo manda Meta. */
  phone: string
}

type SeedOpts = {
  settings?: Record<string, unknown>
  /** Complejo con MercadoPago conectado (el token es solo un marcador: nada llama a MP). */
  mp?: boolean
  openingHours?: Record<string, DayHours>
  closesNextDay?: boolean
  closedDates?: string[]
  status?: 'trialing' | 'active' | 'suspended'
}

function randomPhone(): string {
  return `54911${faker.string.numeric(8)}`
}

/** Complejo con una cancha (todo el día con tarifa), un staff activo y un chat. */
async function seed(opts: SeedOpts = {}): Promise<Seed> {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id, 'admin')

  await sql`
    UPDATE tenants
    SET settings = ${sql.json({ ...BASE_SETTINGS, ...opts.settings } as never)},
        opening_hours = ${sql.json((opts.openingHours ?? weekOf(OPEN_8_TO_23)) as never)},
        closes_next_day = ${opts.closesNextDay ?? false},
        mp_access_token = ${opts.mp ? 'enc-test-token' : null},
        status = ${opts.status ?? 'active'}::tenant_status
    WHERE id = ${tenant.id}
  `
  if (opts.closedDates) {
    await sql`
      UPDATE tenants SET closed_dates = ${sql.array(opts.closedDates)}::date[]
      WHERE id = ${tenant.id}
    `
  }

  const pricing = {
    rules: [
      {
        days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        from: '00:00',
        to: '00:00',
        price: PRICE,
      },
    ],
  }
  const courts = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenant.id}, 'Cancha 1', 10, ${sql.json(pricing)}, 'online')
    RETURNING id
  `
  const phone = randomPhone()
  const chatId = await insertWhatsappChat(sql, { tenantId: tenant.id, waPhone: phone })
  return { tenantId: tenant.id, courtId: courts[0]!.id, chatId, phone }
}

/** Otro chat (otro teléfono) del mismo complejo. */
async function addChat(s: Seed): Promise<Seed> {
  const phone = randomPhone()
  const chatId = await insertWhatsappChat(getSql(), { tenantId: s.tenantId, waPhone: phone })
  return { ...s, chatId, phone }
}

function book(s: Seed, over: Partial<CreateWhatsappBookingInput> = {}) {
  return withTenantContext(s.tenantId, (tx) =>
    createWhatsappBooking(
      s.tenantId,
      {
        chatId: s.chatId,
        courtId: s.courtId,
        date: DATE,
        timeStart: '20:00',
        guestName: 'Juan Pérez',
        guestPhone: s.phone,
        ...over,
      },
      tx,
    ),
  )
}

async function countBookings(tenantId: string): Promise<number> {
  const rows = await getSql()<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM bookings WHERE tenant_id = ${tenantId}
  `
  return rows[0]!.n
}

const scheduledExpiries: string[] = []

beforeAll(async () => {
  setExpiryScheduler(async (bookingId) => {
    scheduledExpiries.push(bookingId)
  })
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  setExpiryScheduler(null)
  await closeSql()
})

describe('createWhatsappBooking — alta', () => {
  it('sin seña: confirma, queda atada al chat, sin cuenta ni staff, y avisa al admin', async () => {
    const s = await seed()
    const res = await book(s)

    expect(res.alreadyExisted).toBe(false)
    expect(res.requiresPayment).toBe(false)
    expect(res.booking).toMatchObject({
      status: 'confirmed',
      type: 'spontaneous',
      depositStatus: 'not_required',
      depositAmount: 0,
      priceSnapshot: PRICE,
      playerId: null,
      createdByStaff: null,
      guestName: 'Juan Pérez',
      guestPhone: s.phone,
    })

    const sql = getSql()
    const [row] = await sql<
      {
        whatsapp_chat_id: string | null
        date: string
        time_start: string
        time_end: string
        starts_at: string
      }[]
    >`
      SELECT whatsapp_chat_id, date::text AS date, time_start::text AS time_start,
             time_end::text AS time_end, starts_at
      FROM bookings WHERE id = ${res.booking.id}
    `
    expect(row?.whatsapp_chat_id).toBe(s.chatId)
    expect(row?.date).toBe(DATE)
    expect(row?.time_start).toBe('20:00:00')
    expect(row?.time_end).toBe('21:00:00')
    // 20:00 ART (UTC-3) = 23:00 UTC.
    expect(new Date(row!.starts_at)).toEqual(new Date(`${DATE}T23:00:00Z`))

    // El mismo mail que la reserva online (a cada staff activo), sin push nuevo.
    const mails = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM notifications
      WHERE tenant_id = ${s.tenantId} AND trigger_event = 'booking.admin_new_booking'
    `
    expect(mails[0]!.n).toBe(1)
    expect(scheduledExpiries).not.toContain(res.booking.id)
  })

  it('con seña y MercadoPago conectado: queda en hold, con el monto de la seña y el timer de vencimiento', async () => {
    const s = await seed({ mp: true, settings: { requires_deposit: true } })
    const res = await book(s)

    expect(res.requiresPayment).toBe(true)
    expect(res.alreadyExisted).toBe(false)
    expect(res.booking).toMatchObject({
      status: 'pending_payment',
      depositStatus: 'pending',
      // 30% de $8.000, en centavos.
      depositAmount: 240_000,
      paymentMethod: null,
      playerId: null,
    })
    expect(scheduledExpiries).toContain(res.booking.id)
  })

  it('seña pedida pero MercadoPago SIN conectar: confirma sin seña (decisión del dueño, 2026-08-18)', async () => {
    const s = await seed({ mp: false, settings: { requires_deposit: true } })
    const res = await book(s)

    expect(res.requiresPayment).toBe(false)
    expect(res.booking).toMatchObject({
      status: 'confirmed',
      depositStatus: 'not_required',
      depositAmount: 0,
    })
  })

  it('un turno de madrugada de un complejo que cierra pasada la medianoche cae en el día físico siguiente', async () => {
    // Abre 18:00 y cierra 02:00: el 01:00 es el último turno del día operativo DATE.
    const s = await seed({
      openingHours: weekOf({ open: '18:00', close: '02:00' }),
      closesNextDay: true,
    })
    const res = await book(s, { timeStart: '01:00' })

    const [row] = await getSql()<{ date: string; starts_at: string; time_end: string }[]>`
      SELECT date::text AS date, starts_at, time_end::text AS time_end
      FROM bookings WHERE id = ${res.booking.id}
    `
    // `date` es el día OPERATIVO; el instante físico es la 01:00 ART del día calendario siguiente.
    expect(row?.date).toBe(DATE)
    expect(row?.time_end).toBe('02:00:00')
    expect(new Date(row!.starts_at)).toEqual(new Date(`${addDays(DATE, 1)}T04:00:00Z`))

    // 02:00 ya es el cierre: no existe como inicio de turno.
    await expect(book(s, { timeStart: '02:00' })).rejects.toMatchObject({
      name: 'BookingNotOfferedError',
      reason: 'outside_hours',
    })
  })
})

describe('createWhatsappBooking — turno ocupado', () => {
  it('otro chat pidiendo el mismo turno → SlotTakenError, sin segunda fila', async () => {
    const s = await seed()
    await book(s)
    const other = await addChat(s)

    await expect(book(other)).rejects.toBeInstanceOf(SlotTakenError)
    expect(await countBookings(s.tenantId)).toBe(1)
  })
})

describe('createWhatsappBooking — idempotencia', () => {
  it('el reintento de una reserva confirmada devuelve la misma fila, sin duplicar ni volver a avisar', async () => {
    const s = await seed()
    const first = await book(s)
    const retry = await book(s)

    expect(retry.alreadyExisted).toBe(true)
    expect(retry.requiresPayment).toBe(false)
    expect(retry.booking.id).toBe(first.booking.id)
    expect(await countBookings(s.tenantId)).toBe(1)

    const mails = await getSql()<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM notifications
      WHERE tenant_id = ${s.tenantId} AND trigger_event = 'booking.admin_new_booking'
    `
    expect(mails[0]!.n).toBe(1)
  })

  it('el reintento de un hold devuelve el hold, y avisa que sigue pidiendo pago', async () => {
    const s = await seed({ mp: true, settings: { requires_deposit: true } })
    const first = await book(s)
    const retry = await book(s)

    expect(retry.alreadyExisted).toBe(true)
    expect(retry.requiresPayment).toBe(true)
    expect(retry.booking.id).toBe(first.booking.id)
    expect(await countBookings(s.tenantId)).toBe(1)
  })

  it('un reintento concurrente del mismo chat no duplica: el lock del chat los serializa', async () => {
    const s = await seed()
    const [a, b] = await Promise.all([book(s), book(s)])

    expect(a.booking.id).toBe(b.booking.id)
    expect([a.alreadyExisted, b.alreadyExisted].sort()).toEqual([false, true])
    expect(await countBookings(s.tenantId)).toBe(1)
  })

  it('el reintento de la reserva que completó el tope no choca con el tope', async () => {
    const s = await seed({ mp: true, settings: { requires_deposit: true } })
    for (const timeStart of ['10:00', '11:00', '12:00']) await book(s, { timeStart })

    const retry = await book(s, { timeStart: '12:00' })
    expect(retry.alreadyExisted).toBe(true)
  })

  it('una reserva cancelada del mismo chat y turno no cuenta como existente', async () => {
    const s = await seed()
    const first = await book(s)
    await getSql()`
      UPDATE bookings SET status = 'canceled_no_refund'::booking_status
      WHERE id = ${first.booking.id}
    `

    const again = await book(s)
    expect(again.alreadyExisted).toBe(false)
    expect(again.booking.id).not.toBe(first.booking.id)
  })
})

describe('createWhatsappBooking — topes por chat', () => {
  it(`rechaza el hold ${MAX_WHATSAPP_ACTIVE_HOLDS_PER_CHAT + 1} del mismo chat; otro chat sigue pudiendo reservar`, async () => {
    const s = await seed({ mp: true, settings: { requires_deposit: true } })
    for (let i = 0; i < MAX_WHATSAPP_ACTIVE_HOLDS_PER_CHAT; i++) {
      await book(s, { timeStart: `${10 + i}:00` })
    }

    const err = await book(s, { timeStart: '15:00' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TooManyWhatsappBookingsError)
    expect(err).toMatchObject({
      reason: 'holds',
      activeCount: MAX_WHATSAPP_ACTIVE_HOLDS_PER_CHAT,
      chatId: s.chatId,
    })
    expect(await countBookings(s.tenantId)).toBe(MAX_WHATSAPP_ACTIVE_HOLDS_PER_CHAT)

    // El tope es del chat, no del complejo.
    const other = await addChat(s)
    const ok = await book(other, { timeStart: '16:00' })
    expect(ok.booking.status).toBe('pending_payment')
  })

  it(`rechaza la reserva ${MAX_WHATSAPP_UNPAID_CONFIRMED_PER_CHAT + 1} futura confirmada sin seña`, async () => {
    const s = await seed()
    for (let i = 0; i < MAX_WHATSAPP_UNPAID_CONFIRMED_PER_CHAT; i++) {
      await book(s, { timeStart: `${10 + i}:00` })
    }

    const err = await book(s, { timeStart: '15:00' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TooManyWhatsappBookingsError)
    expect(err).toMatchObject({
      reason: 'unpaid_confirmed',
      activeCount: MAX_WHATSAPP_UNPAID_CONFIRMED_PER_CHAT,
    })
    expect(await countBookings(s.tenantId)).toBe(MAX_WHATSAPP_UNPAID_CONFIRMED_PER_CHAT)
  })

  it('el tope cuenta POR CHAT: las reservas de otro chat del mismo complejo no suman', async () => {
    const s = await seed()
    const other = await addChat(s)
    for (let i = 0; i < MAX_WHATSAPP_UNPAID_CONFIRMED_PER_CHAT; i++) {
      await book(other, { timeStart: `${10 + i}:00` })
    }

    const res = await book(s, { timeStart: '15:00' })
    expect(res.booking.status).toBe('confirmed')
  })

  it('una reserva confirmada que YA pasó no cuenta para el tope de las futuras sin seña', async () => {
    const s = await seed()
    const sql = getSql()
    // Dos reservas confirmadas sin seña de este chat, pero de hace diez días: el
    // tope es de turnos FUTUROS.
    for (let i = 0; i < MAX_WHATSAPP_UNPAID_CONFIRMED_PER_CHAT; i++) {
      const id = await insertBooking(sql, {
        tenantId: s.tenantId,
        courtId: s.courtId,
        date: addDays(artTodayStr(), -10),
        timeStart: `${10 + i}:00`,
        timeEnd: `${11 + i}:00`,
        status: 'confirmed',
      })
      await sql`UPDATE bookings SET whatsapp_chat_id = ${s.chatId} WHERE id = ${id}`
    }

    const res = await book(s, { timeStart: '15:00' })
    expect(res.booking.status).toBe('confirmed')
  })
})

describe('createWhatsappBooking — horario y portal del complejo', () => {
  it('día de la semana cerrado → BookingNotOfferedError(closed_day)', async () => {
    const hours = weekOf(OPEN_8_TO_23)
    hours[dayKeyOf(DATE)] = { ...OPEN_8_TO_23, closed: true }
    const s = await seed({ openingHours: hours })

    await expect(book(s)).rejects.toMatchObject({
      name: 'BookingNotOfferedError',
      reason: 'closed_day',
    })
    expect(await countBookings(s.tenantId)).toBe(0)
  })

  it('fecha puntual en closed_dates → BookingNotOfferedError(closed_day)', async () => {
    const s = await seed({ closedDates: [DATE] })

    await expect(book(s)).rejects.toMatchObject({
      name: 'BookingNotOfferedError',
      reason: 'closed_day',
    })
    // Otro día del mismo complejo sí se puede.
    const res = await book(s, { date: addDays(DATE, 1) })
    expect(res.booking.status).toBe('confirmed')
  })

  it.each([
    ['antes de abrir', '07:00'],
    ['en el cierre (el último turno arranca una hora antes)', '23:00'],
    ['fuera de la grilla de turnos (08:30 con apertura 08:00)', '08:30'],
  ])(
    'hora fuera de horario, %s → BookingNotOfferedError(outside_hours)',
    async (_label, timeStart) => {
      const s = await seed()

      await expect(book(s, { timeStart })).rejects.toMatchObject({
        name: 'BookingNotOfferedError',
        reason: 'outside_hours',
      })
      expect(await countBookings(s.tenantId)).toBe(0)
    },
  )

  it('el último turno de la grilla (22:00 con cierre 23:00) sí se reserva', async () => {
    const s = await seed()
    const res = await book(s, { timeStart: '22:00' })
    expect(res.booking.status).toBe('confirmed')
  })

  it('complejo sin reservas online → BookingNotOfferedError(online_disabled)', async () => {
    const s = await seed({ settings: { allow_online_booking: false } })
    await expect(book(s)).rejects.toMatchObject({ reason: 'online_disabled' })
  })

  it('portal cerrado (complejo suspendido) → BookingNotOfferedError(portal_closed)', async () => {
    const s = await seed({ status: 'suspended' })
    const err = await book(s).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BookingNotOfferedError)
    expect(err).toMatchObject({ reason: 'portal_closed' })
  })

  it('las reglas de ventana del portal también rigen: anticipación máxima y anticipación mínima', async () => {
    // DATE es hoy+3 al cargar el módulo; con tope 2, una corrida que cruza la
    // medianoche la veía a hoy+2 y la dejaba pasar. Con tope 1 aguanta el cruce.
    const tooFar = await seed({ settings: { booking_advance_days: 1 } })
    await expect(book(tooFar)).rejects.toMatchObject({
      name: 'BookingDateOutOfRangeError',
      reason: 'advance_exceeded',
    })

    const tooSoon = await seed({ settings: { booking_min_advance_hours: 48 } })
    await expect(book(tooSoon, { date: addDays(artTodayStr(), 1) })).rejects.toBeInstanceOf(
      BookingDateOutOfRangeError,
    )
  })
})

describe('createWhatsappBooking — ban', () => {
  async function bannedPlayer(tenantId: string, phone: string, ban: 'active' | 'expired') {
    const sql = getSql()
    const player = await createTestPlayer(sql)
    // `phone_hint8` es una columna generada: los últimos 8 dígitos, sin importar el formato.
    const formatted = `+${phone.slice(0, 2)} ${phone.slice(2, 3)} ${phone.slice(3, 5)} ${phone.slice(5, 9)}-${phone.slice(9)}`
    await sql`UPDATE players SET phone = ${formatted} WHERE id = ${player.id}`
    await linkPlayerToTenant(sql, tenantId, player.id)
    if (ban === 'active') {
      await insertBan(sql, { tenantId, playerId: player.id })
    } else {
      await sql`
        INSERT INTO tenant_player_bans (tenant_id, player_id, reason, banned_until)
        VALUES (${tenantId}, ${player.id}, 'vencido', NOW() - INTERVAL '1 day')
      `
    }
    return player
  }

  it('teléfono de un jugador baneado en el complejo → PlayerBannedError, sin reserva', async () => {
    const s = await seed()
    const player = await bannedPlayer(s.tenantId, s.phone, 'active')

    const err = await book(s).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PlayerBannedError)
    expect(err).toMatchObject({ playerId: player.id, tenantId: s.tenantId, bannedGlobal: false })
    expect(await countBookings(s.tenantId)).toBe(0)
  })

  it('un ban vencido no bloquea', async () => {
    const s = await seed()
    await bannedPlayer(s.tenantId, s.phone, 'expired')

    const res = await book(s)
    expect(res.booking.status).toBe('confirmed')
  })

  it('el ban es POR COMPLEJO: el mismo teléfono baneado en otro complejo reserva sin problema', async () => {
    const s = await seed()
    const other = await seed()
    await bannedPlayer(other.tenantId, s.phone, 'active')

    const res = await book(s)
    expect(res.booking.status).toBe('confirmed')
  })
})

describe('createWhatsappBooking — entrada y aislamiento', () => {
  it('teléfono que no son solo dígitos → BookingValidationError', async () => {
    const s = await seed()
    await expect(book(s, { guestPhone: '+54 9 11 5555-1234' })).rejects.toBeInstanceOf(
      BookingValidationError,
    )
    await expect(book(s, { guestName: '   ' })).rejects.toBeInstanceOf(BookingValidationError)
    expect(await countBookings(s.tenantId)).toBe(0)
  })

  it('un chat de OTRO complejo no se puede usar', async () => {
    const s = await seed()
    const foreign = await seed()

    await expect(book(s, { chatId: foreign.chatId })).rejects.toBeInstanceOf(BookingValidationError)
    expect(await countBookings(s.tenantId)).toBe(0)
  })

  it('una cancha de OTRO complejo, o un id que no es UUID, → CourtOfflineError', async () => {
    const s = await seed()
    const foreign = await seed()

    await expect(book(s, { courtId: foreign.courtId })).rejects.toBeInstanceOf(CourtOfflineError)
    await expect(book(s, { courtId: 'cancha-1' })).rejects.toBeInstanceOf(CourtOfflineError)
    expect(await countBookings(s.tenantId)).toBe(0)
    expect(await countBookings(foreign.tenantId)).toBe(0)
  })
})

describe('createDepositPayment — returnUrls (el bot de WhatsApp vuelve a otra página)', () => {
  async function holdOf(s: Seed) {
    const res = await book(s)
    expect(res.requiresPayment).toBe(true)
    return res.booking
  }

  it('con returnUrls, MercadoPago vuelve a ESAS urls', async () => {
    const s = await seed({ mp: true, settings: { requires_deposit: true } })
    const booking = await holdOf(s)
    const gateway = new MockGateway()
    const urls = {
      success: `${APP_URL}/retorno-test/${booking.id}/ok`,
      failure: `${APP_URL}/retorno-test/${booking.id}/error`,
      pending: `${APP_URL}/retorno-test/${booking.id}/pendiente`,
    }

    await createDepositPayment(booking.id, gateway, s.tenantId, APP_URL, urls)

    expect(gateway.preferenceCalls).toHaveLength(1)
    expect(gateway.preferenceCalls[0]).toMatchObject({
      bookingId: booking.id,
      successUrl: urls.success,
      failureUrl: urls.failure,
      pendingUrl: urls.pending,
      // El aviso de pago NO cambia: sigue siendo el webhook de siempre.
      notificationUrl: `${APP_URL}/api/webhooks/mercadopago?tenant=${s.tenantId}`,
    })
  })

  it('sin returnUrls, el comportamiento es el de siempre (pantallas del jugador con sesión)', async () => {
    const s = await seed({ mp: true, settings: { requires_deposit: true } })
    const booking = await holdOf(s)
    const gateway = new MockGateway()

    await createDepositPayment(booking.id, gateway, s.tenantId, APP_URL)

    expect(gateway.preferenceCalls[0]).toMatchObject({
      successUrl: `${APP_URL}/reserva/${booking.id}/exito`,
      failureUrl: `${APP_URL}/reserva/${booking.id}/error`,
      pendingUrl: `${APP_URL}/reserva/${booking.id}/pendiente`,
    })
  })
})
