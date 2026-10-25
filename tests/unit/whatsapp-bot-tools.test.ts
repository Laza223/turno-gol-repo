import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  withTenantContext: vi.fn(),
  getDb: vi.fn(),
  createWhatsappBooking: vi.fn(),
  cancelByGuest: vi.fn(),
  findChatBookingForCancel: vi.fn(),
  guestLateCancelStatus: vi.fn(),
  getPublicAvailability: vi.fn(),
  createDepositPayment: vi.fn(),
  resolveTenantGateway: vi.fn(),
  notifyAdminPush: vi.fn(),
  notifyAdminBookingConfirmed: vi.fn(),
  notifyAdminBookingCanceled: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/shared/db/client', () => ({
  getDb: mocks.getDb,
  withTenantContext: mocks.withTenantContext,
}))
vi.mock('@/shared/lib/logger', () => ({ logger: mocks.logger }))
vi.mock('@/modules/bookings/booking.whatsapp', () => ({
  createWhatsappBooking: mocks.createWhatsappBooking,
}))
vi.mock('@/modules/bookings/booking.cancellation', () => ({
  cancelByGuest: mocks.cancelByGuest,
  findChatBookingForCancel: mocks.findChatBookingForCancel,
}))
vi.mock('@/modules/bookings/guest-late-cancel', () => ({
  guestLateCancelStatus: mocks.guestLateCancelStatus,
  PHONE_HINT_DIGITS: 8,
}))
vi.mock('@/modules/tenants/public.service', () => ({
  getPublicAvailability: mocks.getPublicAvailability,
}))
vi.mock('@/modules/payments/payment.service', () => ({
  createDepositPayment: mocks.createDepositPayment,
}))
vi.mock('@/modules/payments/mp-oauth', () => ({
  resolveTenantGateway: mocks.resolveTenantGateway,
}))
vi.mock('@/modules/notifications/push.service', () => ({
  notifyAdminPush: mocks.notifyAdminPush,
  notifyAdminBookingConfirmed: mocks.notifyAdminBookingConfirmed,
  notifyAdminBookingCanceled: mocks.notifyAdminBookingCanceled,
}))

import { ToolInputError, type BotTool } from '@/modules/whatsapp-bot/whatsapp-bot.agent'
import {
  HANDOFF_PAUSE_MS,
  buildBotTools,
  type ToolContext,
} from '@/modules/whatsapp-bot/whatsapp-bot.tools'
import {
  BookingAlreadyEndedError,
  BookingDateOutOfRangeError,
  BookingNotCancelableError,
  BookingNotInConfirmedError,
  BookingValidationError,
  CourtOfflineError,
  GuestLateCancelBlockedError,
  PlayerBannedError,
  PriceUnavailableError,
  SlotTakenError,
  TenantInactiveError,
  TooManyWhatsappBookingsError,
} from '@/modules/bookings/booking.errors'
import type { PublicTenant } from '@/modules/tenants/public.service'

// Sábado 2026-10-24 12:00 ART (UTC-3 fijo, sin DST).
const NOW = new Date('2026-10-24T15:00:00Z')
const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const CHAT_ID = '33333333-3333-4333-8333-333333333333'
const WA_PHONE = '5493415551234'
const COURT_ID = '22222222-2222-4222-8222-222222222222'
const COURTS = [{ id: COURT_ID, name: 'Cancha 1' }]
const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999'
const OTHER_CHAT_ID = '88888888-8888-4888-8888-888888888888'

const day = (open: string, close: string) => ({ open, close, closed: false })
function makeTenant(overrides: Partial<PublicTenant> = {}): PublicTenant {
  return {
    id: TENANT_ID,
    slug: 'el-complejo',
    name: 'Complejo El Pelotazo',
    description: null,
    logoUrl: null,
    coverUrl: null,
    address: 'Av. Siempreviva 742',
    city: 'Rosario',
    province: 'Santa Fe',
    phone: '+5493415550000',
    whatsapp: null,
    openingHours: {
      mon: day('08:00', '23:00'),
      tue: day('08:00', '23:00'),
      wed: day('08:00', '23:00'),
      thu: day('08:00', '23:00'),
      fri: day('08:00', '23:00'),
      sat: day('08:00', '23:00'),
      sun: day('08:00', '23:00'),
    },
    closedDates: [],
    closesNextDay: false,
    status: 'active',
    canceledPeriodEnd: null,
    timezone: 'America/Argentina/Buenos_Aires',
    allowOnlineBooking: true,
    requiresDeposit: true,
    depositPercentage: 30,
    hidePrices: false,
    acceptsCash: true,
    acceptsTransfer: false,
    cancellationHoursBefore: 24,
    bookingAdvanceDays: 3,
    bookingMinAdvanceHours: 0,
    amenities: {},
    latitude: null,
    longitude: null,
    ...overrides,
  }
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return { tenant: makeTenant(), chatId: CHAT_ID, waPhone: WA_PHONE, now: NOW, ...overrides }
}

function toolNamed(ctx: ToolContext, name: string): BotTool {
  const tool = buildBotTools(ctx, COURTS).find((t) => t.definition.name === name)
  if (!tool) throw new Error(`tool ${name} no existe`)
  return tool
}

/** Corre la tool y devuelve lo que pasó (resultado o error) sin tirar. */
async function outcomeOf(tool: BotTool, input: unknown): Promise<unknown> {
  return tool.run(input).then(
    (value) => value,
    (err: unknown) => err,
  )
}

// El tx es un centinela: lo único que se verifica es que llegue tal cual a createWhatsappBooking.
const TX = { sentinel: 'tx' }
const setSpy = vi.fn()
const updateSpy = vi.fn()
const whereSpy = vi.fn()
const fakeUpdateTx = { update: updateSpy }

let mpTokenRows: { mpAccessToken: string | null }[] = []

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test')
  mpTokenRows = [{ mpAccessToken: 'encrypted-token' }]

  mocks.withTenantContext.mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn(TX),
  )
  mocks.getDb.mockImplementation(() => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => mpTokenRows }) }) }),
  }))
  mocks.notifyAdminPush.mockResolvedValue({ enqueued: 1 })
  mocks.resolveTenantGateway.mockReturnValue({ gateway: 'mock' })

  whereSpy.mockResolvedValue(undefined)
  setSpy.mockReturnValue({ where: whereSpy })
  updateSpy.mockReturnValue({ set: setSpy })
})

const validBooking = {
  cancha: 'Cancha 1',
  fecha: '2026-10-25',
  hora: '21:00',
  nombre: 'Juan Pérez',
}

function bookingResult(overrides: Record<string, unknown> = {}) {
  return {
    booking: {
      id: '44444444-4444-4444-8444-444444444444',
      priceSnapshot: 1_200_000,
      depositAmount: 360_000,
    },
    requiresPayment: false,
    alreadyExisted: false,
    ...overrides,
  }
}

describe('buildBotTools', () => {
  it('expone exactamente las cuatro herramientas, todas strict y sin propiedades extra', () => {
    const tools = buildBotTools(makeContext(), COURTS)
    expect(tools.map((t) => t.definition.name)).toEqual([
      'ver_disponibilidad',
      'reservar',
      'cancelar',
      'pasar_a_humano',
    ])
    for (const { definition } of tools) {
      expect(definition.strict).toBe(true)
      expect(definition.input_schema).toMatchObject({ additionalProperties: false })
    }
  })

  it('ninguna herramienta le deja al modelo elegir tenant, chat ni teléfono', () => {
    for (const { definition } of buildBotTools(makeContext(), COURTS)) {
      const props = Object.keys((definition.input_schema as { properties: object }).properties)
      for (const forbidden of ['tenant_id', 'chat_id', 'telefono', 'phone', 'wa_phone']) {
        expect(props).not.toContain(forbidden)
      }
    }
  })
})

describe('reservar — tenant, chat y teléfono salen SIEMPRE del contexto', () => {
  it('con input válido, llama a createWhatsappBooking con los datos del contexto', async () => {
    mocks.createWhatsappBooking.mockResolvedValue(bookingResult())
    const out = await toolNamed(makeContext(), 'reservar').run(validBooking)

    expect(mocks.withTenantContext).toHaveBeenCalledWith(TENANT_ID, expect.any(Function))
    expect(mocks.createWhatsappBooking).toHaveBeenCalledTimes(1)
    expect(mocks.createWhatsappBooking).toHaveBeenCalledWith(
      TENANT_ID,
      {
        chatId: CHAT_ID,
        courtId: COURT_ID,
        date: '2026-10-25',
        timeStart: '21:00',
        guestName: 'Juan Pérez',
        guestPhone: WA_PHONE,
      },
      TX,
    )
    expect(JSON.parse(out as string)).toMatchObject({
      estado: 'confirmada',
    })
    expect(JSON.parse(out as string)).not.toHaveProperty('pago')
  })

  it('el nombre se recorta (trim) antes de llegar a la reserva', async () => {
    mocks.createWhatsappBooking.mockResolvedValue(bookingResult())
    await toolNamed(makeContext(), 'reservar').run({ ...validBooking, nombre: '   Juan   ' })
    expect(mocks.createWhatsappBooking.mock.calls[0]?.[1]).toMatchObject({ guestName: 'Juan' })
  })

  it.each([
    ['tenant_id', OTHER_TENANT_ID],
    ['tenantId', OTHER_TENANT_ID],
    ['chat_id', OTHER_CHAT_ID],
    ['chatId', OTHER_CHAT_ID],
    ['telefono', '5490000000000'],
    ['guestPhone', '5490000000000'],
    ['waPhone', '5490000000000'],
  ])(
    'si el modelo manda `%s` en el input, no llega a ningún lado: se rechaza como input inválido',
    async (key, value) => {
      const out = await outcomeOf(toolNamed(makeContext(), 'reservar'), {
        ...validBooking,
        [key]: value,
      })
      expect(out).toBeInstanceOf(ToolInputError)
      expect(mocks.createWhatsappBooking).not.toHaveBeenCalled()
      expect(mocks.withTenantContext).not.toHaveBeenCalled()
    },
  )

  it('aunque el modelo mande tenant_id + chat_id + telefono juntos, jamás se usan sus valores', async () => {
    mocks.createWhatsappBooking.mockResolvedValue(bookingResult())
    await outcomeOf(toolNamed(makeContext(), 'reservar'), {
      ...validBooking,
      tenant_id: OTHER_TENANT_ID,
      chat_id: OTHER_CHAT_ID,
      telefono: '5490000000000',
    })
    // Si alguna vez se relaja el `.strict()` del schema, esto sigue protegiendo:
    // nada de lo que mandó el modelo puede aparecer en la llamada a la reserva.
    for (const call of mocks.createWhatsappBooking.mock.calls) {
      const serialized = JSON.stringify(call)
      expect(serialized).not.toContain(OTHER_TENANT_ID)
      expect(serialized).not.toContain(OTHER_CHAT_ID)
      expect(serialized).not.toContain('5490000000000')
    }
    for (const call of mocks.withTenantContext.mock.calls) {
      expect(call[0]).toBe(TENANT_ID)
    }
  })

  it('usa el teléfono y el chat del contexto de CADA turno (no cachea entre contextos)', async () => {
    mocks.createWhatsappBooking.mockResolvedValue(bookingResult())
    await toolNamed(
      makeContext({ chatId: OTHER_CHAT_ID, waPhone: '5491100000001' }),
      'reservar',
    ).run(validBooking)
    expect(mocks.createWhatsappBooking.mock.calls[0]?.[1]).toMatchObject({
      chatId: OTHER_CHAT_ID,
      guestPhone: '5491100000001',
    })
  })
})

describe('reservar — input inválido → ToolInputError (vuelve al modelo, no tira el turno)', () => {
  it.each([
    ['fecha con barras', { ...validBooking, fecha: '25/10/2026' }],
    ['fecha sin ceros', { ...validBooking, fecha: '2026-10-5' }],
    ['fecha vacía', { ...validBooking, fecha: '' }],
    ['fecha con hora pegada', { ...validBooking, fecha: '2026-10-25T21:00' }],
    ['fecha no string', { ...validBooking, fecha: 20261025 }],
    ['cancha vacía', { ...validBooking, cancha: '' }],
    ['cancha solo espacios', { ...validBooking, cancha: '   ' }],
    ['cancha de 81 caracteres', { ...validBooking, cancha: 'a'.repeat(81) }],
    ['cancha no string', { ...validBooking, cancha: 1 }],
    ['hora 25:00', { ...validBooking, hora: '25:00' }],
    ['hora sin cero', { ...validBooking, hora: '9:00' }],
    ['hora con minutos inválidos', { ...validBooking, hora: '21:75' }],
    ['hora con segundos', { ...validBooking, hora: '21:00:00' }],
    ['nombre de una letra', { ...validBooking, nombre: 'J' }],
    ['nombre solo espacios', { ...validBooking, nombre: '     ' }],
    ['nombre de 81 caracteres', { ...validBooking, nombre: 'a'.repeat(81) }],
    ['sin nombre', { cancha: 'Cancha 1', fecha: '2026-10-25', hora: '21:00' }],
    ['sin cancha', { fecha: '2026-10-25', hora: '21:00', nombre: 'Juan' }],
    ['input null', null],
    ['input string', 'reservar cancha 1'],
    ['input array', []],
    ['input vacío', {}],
  ])('%s', async (_name, input) => {
    const out = await outcomeOf(toolNamed(makeContext(), 'reservar'), input)
    expect(out).toBeInstanceOf(ToolInputError)
    expect(mocks.createWhatsappBooking).not.toHaveBeenCalled()
  })

  it('el mensaje de error no filtra detalles internos (ni schema ni valores)', async () => {
    const out = await outcomeOf(toolNamed(makeContext(), 'reservar'), {
      ...validBooking,
      fecha: 'secreto-que-no-debe-aparecer',
    })
    expect((out as Error).message).toBe('Datos inválidos: revisá el formato y volvé a intentar.')
  })
})

describe('reservar — la cancha va por nombre y la resuelve el servidor', () => {
  it.each([
    ['tal cual', 'Cancha 1'],
    ['sin mayúsculas', 'cancha 1'],
    ['con espacios de más', '  Cancha   1 '],
  ])('%s → reserva la cancha del complejo con su id', async (_name, cancha) => {
    mocks.createWhatsappBooking.mockResolvedValue(bookingResult())
    await toolNamed(makeContext(), 'reservar').run({ ...validBooking, cancha })
    expect(mocks.createWhatsappBooking).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ courtId: COURT_ID }),
      TX,
    )
  })

  it('ignora tildes y eñes: "cancha ñandu" es "Cancha Ñandú"', async () => {
    mocks.createWhatsappBooking.mockResolvedValue(bookingResult())
    const courts = [{ id: COURT_ID, name: 'Cancha Ñandú' }]
    const tool = buildBotTools(makeContext(), courts).find((t) => t.definition.name === 'reservar')!
    await tool.run({ ...validBooking, cancha: 'cancha ñandu' })
    expect(mocks.createWhatsappBooking).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ courtId: COURT_ID }),
      TX,
    )
  })

  it.each([
    ['otra cancha', 'Cancha 9'],
    ['el id en vez del nombre', COURT_ID],
    ['inyección SQL', `Cancha 1'; DROP TABLE bookings;--`],
  ])('%s → cancha_inexistente con la lista, sin reservar', async (_name, cancha) => {
    const out = JSON.parse(
      await toolNamed(makeContext(), 'reservar').run({ ...validBooking, cancha }),
    )
    expect(out).toEqual({ error: 'cancha_inexistente', canchas: ['Cancha 1'] })
    expect(mocks.createWhatsappBooking).not.toHaveBeenCalled()
  })

  it('dos canchas con el mismo nombre → no adivina cuál', async () => {
    const courts = [
      { id: COURT_ID, name: 'Cancha 1' },
      { id: '55555555-5555-4555-8555-555555555555', name: 'cancha 1' },
    ]
    const tool = buildBotTools(makeContext(), courts).find((t) => t.definition.name === 'reservar')!
    const out = JSON.parse(await tool.run(validBooking))
    expect(out.error).toBe('cancha_inexistente')
    expect(mocks.createWhatsappBooking).not.toHaveBeenCalled()
  })
})

describe('reservar — reglas del complejo y traducción de errores de dominio', () => {
  it('reservas online apagadas → error de dominio en JSON, sin tocar la reserva', async () => {
    const ctx = makeContext({ tenant: makeTenant({ allowOnlineBooking: false }) })
    const out = await toolNamed(ctx, 'reservar').run(validBooking)
    expect(JSON.parse(out)).toEqual({ error: 'reservas_online_cerradas' })
    expect(mocks.createWhatsappBooking).not.toHaveBeenCalled()
  })

  it.each(['suspended', 'blocked', 'churned', 'deleted'])(
    'complejo en estado %s → reservas cerradas',
    async (status) => {
      const ctx = makeContext({ tenant: makeTenant({ status }) })
      const out = await toolNamed(ctx, 'reservar').run(validBooking)
      expect(JSON.parse(out)).toEqual({ error: 'reservas_online_cerradas' })
    },
  )

  it('baja voluntaria (canceled) sin período pago comprobable → cerrado', async () => {
    const ctx = makeContext({ tenant: makeTenant({ status: 'canceled', canceledPeriodEnd: null }) })
    expect(JSON.parse(await toolNamed(ctx, 'reservar').run(validBooking))).toEqual({
      error: 'reservas_online_cerradas',
    })
  })

  it('baja voluntaria con período pago vigente → sigue reservando', async () => {
    mocks.createWhatsappBooking.mockResolvedValue(bookingResult())
    const ctx = makeContext({
      tenant: makeTenant({
        status: 'canceled',
        canceledPeriodEnd: new Date('2026-11-30T00:00:00Z'),
      }),
    })
    const out = JSON.parse(await toolNamed(ctx, 'reservar').run(validBooking))
    expect(out.estado).toBe('confirmada')
  })

  it('fecha fuera de la ventana de reserva → fecha_fuera_de_rango sin tocar la reserva', async () => {
    const out = await toolNamed(makeContext(), 'reservar').run({
      ...validBooking,
      fecha: '2026-11-30',
    })
    expect(JSON.parse(out)).toEqual({ error: 'fecha_fuera_de_rango' })
    expect(mocks.createWhatsappBooking).not.toHaveBeenCalled()
  })

  it.each([
    ['SlotTakenError', 'turno_ocupado', () => new SlotTakenError()],
    [
      'TooManyWhatsappBookingsError holds',
      'demasiadas_senas_pendientes',
      () => new TooManyWhatsappBookingsError(CHAT_ID, TENANT_ID, 'holds', 2),
    ],
    [
      'BookingDateOutOfRangeError lead_time',
      'falta_poco_para_el_turno',
      () => new BookingDateOutOfRangeError('lead_time'),
    ],
    [
      'BookingDateOutOfRangeError advance_exceeded',
      'fecha_fuera_de_rango',
      () => new BookingDateOutOfRangeError('advance_exceeded'),
    ],
    [
      'BookingDateOutOfRangeError past_slot',
      'fecha_fuera_de_rango',
      () => new BookingDateOutOfRangeError('past_slot'),
    ],
    ['BookingValidationError', 'turno_no_disponible', () => new BookingValidationError('x')],
    ['CourtOfflineError', 'turno_no_disponible', () => new CourtOfflineError(COURT_ID)],
    ['PriceUnavailableError', 'turno_no_disponible', () => new PriceUnavailableError()],
  ])('%s → { error: "%s" }', async (_name, reason, makeError) => {
    mocks.createWhatsappBooking.mockRejectedValue(makeError())
    const out = await toolNamed(makeContext(), 'reservar').run(validBooking)
    expect(JSON.parse(out)).toEqual({ error: reason })
  })

  // Decisión del dueño (2026-10-20): la tercera reserva sin seña se hace en la
  // página del complejo, así que el bot recibe el link para mandárselo.
  it('tope de reservas sin seña → error + link a la página del complejo', async () => {
    mocks.createWhatsappBooking.mockRejectedValue(
      new TooManyWhatsappBookingsError(CHAT_ID, TENANT_ID, 'unpaid_confirmed', 2),
    )
    const out = await toolNamed(makeContext(), 'reservar').run(validBooking)
    expect(JSON.parse(out)).toEqual({
      error: 'demasiadas_reservas_sin_sena',
      link_para_reservar: 'https://app.test/el-complejo',
    })
  })

  it('jugador con ban: el bot NO explica el motivo, solo deriva', async () => {
    mocks.createWhatsappBooking.mockRejectedValue(
      new PlayerBannedError('p1', TENANT_ID, false, 'motivo-interno-del-ban'),
    )
    const out = await toolNamed(makeContext(), 'reservar').run(validBooking)
    expect(JSON.parse(out)).toEqual({ error: 'no_se_puede_reservar_por_aca' })
    expect(out).not.toContain('motivo-interno-del-ban')
  })

  it('bloqueo por cancelaciones tardías del invitado → bloqueado con dd/mm HH:MM en hora ART', async () => {
    // 2026-11-01 02:00Z = 31/10 23:00 ART: el día se cuenta en Argentina, no en UTC.
    mocks.createWhatsappBooking.mockRejectedValue(
      new GuestLateCancelBlockedError(new Date('2026-11-01T02:00:00Z')),
    )
    const out = await toolNamed(makeContext(), 'reservar').run(validBooking)
    expect(JSON.parse(out)).toEqual({ error: 'bloqueado', hasta: '31/10 23:00' })
  })

  it('un error inesperado se propaga tal cual (el turno pasa a una persona), NO como ToolInputError', async () => {
    const boom = new Error('connection terminated')
    mocks.createWhatsappBooking.mockRejectedValue(boom)
    const out = await outcomeOf(toolNamed(makeContext(), 'reservar'), validBooking)
    expect(out).toBe(boom)
    expect(out).not.toBeInstanceOf(ToolInputError)
  })
})

describe('reservar — con seña', () => {
  beforeEach(() => {
    mocks.createWhatsappBooking.mockResolvedValue(bookingResult({ requiresPayment: true }))
    mocks.createDepositPayment.mockResolvedValue({ initPoint: 'https://mp.test/checkout/abc' })
  })

  it('crea la preferencia FUERA de la tx y devuelve el link con los minutos para pagar', async () => {
    const out = JSON.parse(await toolNamed(makeContext(), 'reservar').run(validBooking))
    expect(out).toMatchObject({
      estado: 'falta_pagar_la_sena',
      fecha: '2026-10-25',
      hora: '21:00',
      link_pago: 'https://mp.test/checkout/abc',
      minutos_para_pagar: 6,
    })
    const back = 'https://app.test/reserva/44444444-4444-4444-8444-444444444444/whatsapp'
    expect(mocks.resolveTenantGateway).toHaveBeenCalledWith(TENANT_ID, 'encrypted-token')
    expect(mocks.createDepositPayment).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444',
      { gateway: 'mock' },
      TENANT_ID,
      'https://app.test',
      { success: back, failure: back, pending: back },
    )
    // La única `withTenantContext` es la de la reserva: la preferencia no corre adentro.
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1)
  })

  it('complejo sin MercadoPago conectado → turno_no_disponible, sin crear preferencia', async () => {
    mpTokenRows = [{ mpAccessToken: null }]
    const out = JSON.parse(await toolNamed(makeContext(), 'reservar').run(validBooking))
    expect(out).toEqual({ error: 'turno_no_disponible' })
    expect(mocks.createDepositPayment).not.toHaveBeenCalled()
    expect(mocks.logger.warn).toHaveBeenCalled()
  })

  it('si MercadoPago falla al crear la preferencia, el error se propaga (turno a una persona)', async () => {
    const boom = new Error('mp 500')
    mocks.createDepositPayment.mockRejectedValue(boom)
    expect(await outcomeOf(toolNamed(makeContext(), 'reservar'), validBooking)).toBe(boom)
  })

  it('con hidePrices no muestra el precio total del turno', async () => {
    const ctx = makeContext({ tenant: makeTenant({ hidePrices: true }) })
    const out = JSON.parse(await toolNamed(ctx, 'reservar').run(validBooking))
    expect(out).not.toHaveProperty('precio')
  })
})

describe('reservar — aviso push al admin', () => {
  const BOOKING_ID = '44444444-4444-4444-8444-444444444444'

  it('sin seña: la reserva queda confirmada y se avisa al admin con el tenant del contexto', async () => {
    mocks.createWhatsappBooking.mockResolvedValue(bookingResult())
    const out = JSON.parse(await toolNamed(makeContext(), 'reservar').run(validBooking))
    expect(out).toMatchObject({ estado: 'confirmada' })
    expect(mocks.notifyAdminBookingConfirmed).toHaveBeenCalledTimes(1)
    expect(mocks.notifyAdminBookingConfirmed).toHaveBeenCalledWith(TENANT_ID, BOOKING_ID)
  })

  it('con seña: no avisa todavía (avisa al confirmarse el pago, por el webhook)', async () => {
    mocks.createWhatsappBooking.mockResolvedValue(bookingResult({ requiresPayment: true }))
    mocks.createDepositPayment.mockResolvedValue({ initPoint: 'https://mp.test/checkout/abc' })
    await toolNamed(makeContext(), 'reservar').run(validBooking)
    expect(mocks.notifyAdminBookingConfirmed).not.toHaveBeenCalled()
  })

  it('si la reserva falla, no se avisa nada', async () => {
    mocks.createWhatsappBooking.mockRejectedValue(new Error('boom'))
    await outcomeOf(toolNamed(makeContext(), 'reservar'), validBooking)
    expect(mocks.notifyAdminBookingConfirmed).not.toHaveBeenCalled()
  })
})

describe('cancelar — dos pasos, solo reservas de este chat', () => {
  const BOOKING_ID = '44444444-4444-4444-8444-444444444444'
  const cancelInputOk = { cancha: 'Cancha 1', fecha: '2026-10-25', hora: '21:00' }
  // El turno es el dom 25/10 21:00 ART; NOW es el sáb 24/10 12:00 ART (33 h antes).
  const found = (overrides: Record<string, unknown> = {}) => ({
    id: BOOKING_ID,
    status: 'confirmed',
    depositStatus: 'not_required',
    depositAmount: 0,
    startsAt: new Date('2026-10-26T00:00:00Z'),
    endsAt: new Date('2026-10-26T01:00:00Z'),
    guestPhone: WA_PHONE,
    ...overrides,
  })
  const lateTenant = () => makeTenant({ requiresDeposit: false, lateCancelHours: 48 })

  beforeEach(() => {
    mocks.findChatBookingForCancel.mockResolvedValue(found())
    mocks.guestLateCancelStatus.mockResolvedValue({ count: 0, bannedUntil: null })
  })

  it('confirmar:false NO escribe y busca solo con el chat y el tenant de la clausura', async () => {
    const out = await toolNamed(makeContext({ tenant: lateTenant() }), 'cancelar').run({
      ...cancelInputOk,
      confirmar: false,
    })
    expect(JSON.parse(out)).toEqual({ consecuencia: 'aviso' })
    expect(mocks.cancelByGuest).not.toHaveBeenCalled()
    expect(mocks.findChatBookingForCancel).toHaveBeenCalledWith(
      TENANT_ID,
      CHAT_ID,
      { courtId: COURT_ID, date: '2026-10-25', timeStart: '21:00' },
      TX,
    )
    expect(mocks.guestLateCancelStatus).toHaveBeenCalledWith(TENANT_ID, '15551234', TX)
  })

  it('el count+1 del invitado decide: con una tardía previa, la próxima es bloqueo de 7 días', async () => {
    mocks.guestLateCancelStatus.mockResolvedValue({ count: 1, bannedUntil: null })
    const out = await toolNamed(makeContext({ tenant: lateTenant() }), 'cancelar').run({
      ...cancelInputOk,
      confirmar: false,
    })
    expect(JSON.parse(out)).toEqual({ consecuencia: 'bloqueo', dias: 7 })
  })

  it('antes del umbral y sin seña → sin_consecuencia', async () => {
    const tenant = makeTenant({ requiresDeposit: false, lateCancelHours: 12 })
    const out = await toolNamed(makeContext({ tenant }), 'cancelar').run({
      ...cancelInputOk,
      confirmar: false,
    })
    expect(JSON.parse(out)).toEqual({ consecuencia: 'sin_consecuencia' })
  })

  it.each([
    ['en plazo', 24, 'se_devuelve_la_sena'],
    ['fuera de plazo', 48, 'pierde_la_sena'],
  ])('con seña paga %s → %s', async (_n, policyHours, consecuencia) => {
    mocks.findChatBookingForCancel.mockResolvedValue(
      found({ depositStatus: 'paid', depositAmount: 360_000 }),
    )
    const tenant = makeTenant({ cancellationHoursBefore: policyHours })
    const out = await toolNamed(makeContext({ tenant }), 'cancelar').run({
      ...cancelInputOk,
      confirmar: false,
    })
    expect(JSON.parse(out)).toEqual({ consecuencia })
  })

  it('confirmar:true cancela con cancelByGuest dentro de withTenantContext y cuenta la penalidad', async () => {
    mocks.cancelByGuest.mockResolvedValue({
      booking: {},
      notificationIds: [],
      guestPenalty: { count: 2, bannedUntil: new Date('2026-11-10T00:00:00Z') },
      inPolicy: false,
      depositStatus: 'not_required',
    })
    const out = await toolNamed(makeContext({ tenant: lateTenant() }), 'cancelar').run({
      ...cancelInputOk,
      confirmar: true,
    })
    expect(mocks.cancelByGuest).toHaveBeenCalledWith(BOOKING_ID, CHAT_ID, TX)
    expect(JSON.parse(out)).toEqual({
      estado: 'cancelada',
      cancha: 'Cancha 1',
      fecha: '2026-10-25',
      hora: '21:00',
      consecuencia: 'bloqueo',
      dias: 7,
      hasta: '09/11 21:00',
    })
  })

  it.each([true, false])(
    'reintento (confirmar:%s) sobre una ya cancelada tarde: cuenta lo que pasó, sin consecuencia futura',
    async (confirmar) => {
      mocks.findChatBookingForCancel.mockResolvedValue(
        found({ status: 'canceled_no_refund', canceledLate: true }),
      )
      mocks.cancelByGuest.mockResolvedValue({
        booking: {},
        notificationIds: [],
        replayed: true,
        guestPenalty: { count: 1, bannedUntil: null },
        inPolicy: false,
        depositStatus: 'not_required',
      })
      const out = await toolNamed(makeContext({ tenant: lateTenant() }), 'cancelar').run({
        ...cancelInputOk,
        confirmar,
      })
      expect(JSON.parse(out)).toMatchObject({ estado: 'cancelada', consecuencia: 'aviso' })
      // Ni siquiera la preview consulta la escalera: lo dice la fila.
      expect(mocks.guestLateCancelStatus).not.toHaveBeenCalled()
    },
  )

  describe('aviso push al admin', () => {
    const outcome = (overrides: Record<string, unknown> = {}) => ({
      booking: {},
      notificationIds: [],
      guestPenalty: null,
      inPolicy: true,
      depositStatus: 'not_required',
      ...overrides,
    })

    it('cancelación hecha: avisa después del commit, con el tenant del contexto y late: false', async () => {
      mocks.cancelByGuest.mockResolvedValue(outcome())
      await toolNamed(makeContext(), 'cancelar').run({ ...cancelInputOk, confirmar: true })
      expect(mocks.notifyAdminBookingCanceled).toHaveBeenCalledTimes(1)
      expect(mocks.notifyAdminBookingCanceled).toHaveBeenCalledWith(TENANT_ID, BOOKING_ID, {
        late: false,
      })
    })

    it('cancelación tardía: el aviso sale con late: true', async () => {
      mocks.cancelByGuest.mockResolvedValue(
        outcome({ lateCancel: true, guestPenalty: { count: 1, bannedUntil: null } }),
      )
      await toolNamed(makeContext({ tenant: lateTenant() }), 'cancelar').run({
        ...cancelInputOk,
        confirmar: true,
      })
      expect(mocks.notifyAdminBookingCanceled).toHaveBeenCalledWith(TENANT_ID, BOOKING_ID, {
        late: true,
      })
    })

    it('replay de una cancelación ya hecha: no vuelve a avisar', async () => {
      mocks.cancelByGuest.mockResolvedValue(outcome({ replayed: true }))
      await toolNamed(makeContext(), 'cancelar').run({ ...cancelInputOk, confirmar: true })
      expect(mocks.notifyAdminBookingCanceled).not.toHaveBeenCalled()
    })

    it('la preview (confirmar:false) no cancela ni avisa', async () => {
      await toolNamed(makeContext(), 'cancelar').run({ ...cancelInputOk, confirmar: false })
      expect(mocks.cancelByGuest).not.toHaveBeenCalled()
      expect(mocks.notifyAdminBookingCanceled).not.toHaveBeenCalled()
    })

    it('si cancelByGuest falla, no avisa', async () => {
      mocks.cancelByGuest.mockRejectedValue(new BookingAlreadyEndedError('x'))
      await toolNamed(makeContext(), 'cancelar').run({ ...cancelInputOk, confirmar: true })
      expect(mocks.notifyAdminBookingCanceled).not.toHaveBeenCalled()
    })
  })

  it('confirmar:true con seña devuelta → se_devuelve_la_sena', async () => {
    mocks.cancelByGuest.mockResolvedValue({
      booking: {},
      notificationIds: [],
      guestPenalty: null,
      inPolicy: true,
      depositStatus: 'refunded',
    })
    const out = JSON.parse(
      await toolNamed(makeContext(), 'cancelar').run({ ...cancelInputOk, confirmar: true }),
    )
    expect(out).toMatchObject({ estado: 'cancelada', consecuencia: 'se_devuelve_la_sena' })
  })

  it('una reserva de otro chat (o inexistente) no se encuentra y no se cancela nada', async () => {
    mocks.findChatBookingForCancel.mockResolvedValue(null)
    const out = await toolNamed(makeContext(), 'cancelar').run({
      ...cancelInputOk,
      confirmar: true,
    })
    expect(JSON.parse(out)).toEqual({ error: 'no_encontrada' })
    expect(mocks.cancelByGuest).not.toHaveBeenCalled()
  })

  it('pendiente de pago → pendiente_de_pago sin cancelar (el hold se libera solo)', async () => {
    mocks.findChatBookingForCancel.mockResolvedValue(found({ status: 'pending_payment' }))
    const out = await toolNamed(makeContext(), 'cancelar').run({
      ...cancelInputOk,
      confirmar: true,
    })
    expect(JSON.parse(out)).toEqual({ error: 'pendiente_de_pago' })
    expect(mocks.cancelByGuest).not.toHaveBeenCalled()
  })

  it('turno que ya terminó → ya_empezo', async () => {
    mocks.findChatBookingForCancel.mockResolvedValue(
      found({ endsAt: new Date('2026-10-24T14:00:00Z') }),
    )
    const out = await toolNamed(makeContext(), 'cancelar').run({
      ...cancelInputOk,
      confirmar: false,
    })
    expect(JSON.parse(out)).toEqual({ error: 'ya_empezo' })
  })

  it.each([
    ['BookingAlreadyEndedError', 'ya_empezo', () => new BookingAlreadyEndedError('x')],
    ['BookingNotInConfirmedError', 'no_encontrada', () => new BookingNotInConfirmedError('x')],
    [
      'BookingNotCancelableError',
      'no_encontrada',
      () => new BookingNotCancelableError('x', 'canceled_no_refund', 'admin'),
    ],
    [
      'TenantInactiveError',
      'no_se_puede_cancelar_por_aca',
      () => new TenantInactiveError(TENANT_ID, 'blocked'),
    ],
  ])('%s → { error: "%s" }', async (_n, reason, makeError) => {
    mocks.cancelByGuest.mockRejectedValue(makeError())
    const out = await toolNamed(makeContext(), 'cancelar').run({
      ...cancelInputOk,
      confirmar: true,
    })
    expect(JSON.parse(out)).toEqual({ error: reason })
  })

  it('un error inesperado se propaga (el turno pasa a una persona)', async () => {
    const boom = new Error('connection terminated')
    mocks.cancelByGuest.mockRejectedValue(boom)
    expect(
      await outcomeOf(toolNamed(makeContext(), 'cancelar'), { ...cancelInputOk, confirmar: true }),
    ).toBe(boom)
  })

  it('cancha inexistente → lista de canchas, sin buscar', async () => {
    const out = await toolNamed(makeContext(), 'cancelar').run({
      ...cancelInputOk,
      cancha: 'Cancha 9',
      confirmar: true,
    })
    expect(JSON.parse(out)).toEqual({ error: 'cancha_inexistente', canchas: ['Cancha 1'] })
    expect(mocks.findChatBookingForCancel).not.toHaveBeenCalled()
  })

  it.each([
    ['sin confirmar', cancelInputOk],
    ['confirmar como string', { ...cancelInputOk, confirmar: 'true' }],
    ['tenant_id', { ...cancelInputOk, confirmar: true, tenant_id: OTHER_TENANT_ID }],
    ['chat_id', { ...cancelInputOk, confirmar: true, chat_id: OTHER_CHAT_ID }],
    ['booking_id', { ...cancelInputOk, confirmar: true, booking_id: BOOKING_ID }],
    ['hora inválida', { ...cancelInputOk, hora: '9:00', confirmar: true }],
  ])('input inválido (%s) → ToolInputError y no toca nada', async (_n, input) => {
    const out = await outcomeOf(toolNamed(makeContext(), 'cancelar'), input)
    expect(out).toBeInstanceOf(ToolInputError)
    expect(mocks.findChatBookingForCancel).not.toHaveBeenCalled()
    expect(mocks.cancelByGuest).not.toHaveBeenCalled()
  })
})

describe('pasar_a_humano — solo el enum cerrado de motivos', () => {
  it('la definición lista exactamente los motivos permitidos', () => {
    const { definition } = toolNamed(makeContext(), 'pasar_a_humano')
    const props = (definition.input_schema as { properties: { motivo: { enum: string[] } } })
      .properties
    expect(props.motivo.enum).toEqual(['lluvia', 'reclamo', 'evento', 'otro'])
  })

  it.each([
    ['lluvia', 'handoff_weather', 'Consulta por lluvia o suspensión'],
    ['reclamo', 'handoff_complaint', 'Un reclamo'],
    ['evento', 'handoff_event', 'Consulta por un evento o cumpleaños'],
    ['otro', 'handoff_other', 'Una consulta que el bot no pudo resolver'],
  ])(
    'motivo "%s": pausa el chat 12 h con "%s" y avisa al admin',
    async (motivo, pauseReason, label) => {
      mocks.withTenantContext.mockImplementation(
        async (_t: string, fn: (tx: unknown) => Promise<unknown>) => fn(fakeUpdateTx),
      )
      const out = await toolNamed(makeContext(), 'pasar_a_humano').run({ motivo })

      expect(JSON.parse(out)).toEqual({ ok: true })
      expect(mocks.withTenantContext).toHaveBeenCalledWith(TENANT_ID, expect.any(Function))
      // Son SQL (GREATEST contra la pausa vigente, para no acortar una más
      // larga): se compilan y se miran los parámetros. Que no acorte una pausa
      // vigente lo prueba la integración (whatsapp-bot-turn.test.ts).
      const arg = setSpy.mock.calls[0]![0] as { pausedUntil: SQL; pauseReason: SQL }
      const until = new Date(NOW.getTime() + HANDOFF_PAUSE_MS).toISOString()
      expect(new PgDialect().sqlToQuery(arg.pausedUntil).params).toContain(until)
      expect(new PgDialect().sqlToQuery(arg.pauseReason).params).toContain(pauseReason)
      expect(HANDOFF_PAUSE_MS).toBe(12 * 60 * 60 * 1000)
      expect(mocks.notifyAdminPush).toHaveBeenCalledWith(TENANT_ID, {
        type: 'whatsapp_handoff',
        title: 'WhatsApp: te necesitan en un chat',
        body: label,
        summaryLabel: label,
        url: '/settings/whatsapp',
      })
    },
  )

  it.each([
    ['motivo fuera del enum', { motivo: 'cancelacion' }],
    ['motivo con otra capitalización', { motivo: 'LLUVIA' }],
    ['motivo con espacios', { motivo: ' lluvia ' }],
    ['motivo de prototipo (constructor)', { motivo: 'constructor' }],
    ['motivo vacío', { motivo: '' }],
    ['motivo de texto libre', { motivo: 'el jugador está enojado porque le cobraron mal' }],
    ['motivo no string', { motivo: 1 }],
    ['sin motivo', {}],
    [
      'texto libre extra junto a un motivo válido (Ley 25.326)',
      { motivo: 'otro', detalle: 'DNI 30.123.456' },
    ],
    ['input null', null],
    ['input string', 'lluvia'],
  ])('%s → ToolInputError y no pausa nada', async (_name, input) => {
    const out = await outcomeOf(toolNamed(makeContext(), 'pasar_a_humano'), input)
    expect(out).toBeInstanceOf(ToolInputError)
    expect(mocks.withTenantContext).not.toHaveBeenCalled()
    expect(mocks.notifyAdminPush).not.toHaveBeenCalled()
  })

  it('si el push al admin falla, el chat queda pausado y la tool igual responde ok', async () => {
    mocks.withTenantContext.mockImplementation(
      async (_t: string, fn: (tx: unknown) => Promise<unknown>) => fn(fakeUpdateTx),
    )
    mocks.notifyAdminPush.mockRejectedValue(new Error('push down'))
    const out = await toolNamed(makeContext(), 'pasar_a_humano').run({ motivo: 'reclamo' })
    expect(JSON.parse(out)).toEqual({ ok: true })
    expect(setSpy).toHaveBeenCalledTimes(1)
    expect(mocks.logger.warn).toHaveBeenCalled()
  })

  it('el chat que se pausa es el del contexto (filtro por id de chat y tenant)', async () => {
    mocks.withTenantContext.mockImplementation(
      async (_t: string, fn: (tx: unknown) => Promise<unknown>) => fn(fakeUpdateTx),
    )
    await toolNamed(makeContext({ chatId: OTHER_CHAT_ID }), 'pasar_a_humano').run({
      motivo: 'otro',
    })
    expect(whereSpy).toHaveBeenCalledTimes(1)
    // El `where` es una expresión de drizzle: se renderiza a SQL para ver los parámetros ligados.
    const { params } = new PgDialect().sqlToQuery(whereSpy.mock.calls[0]?.[0])
    expect(params).toEqual([OTHER_CHAT_ID, TENANT_ID])
  })
})

describe('ver_disponibilidad', () => {
  const availability = (date: string) => ({
    date,
    courts: [
      {
        id: COURT_ID,
        name: 'Cancha 1',
        format: 5,
        slots: [
          { time: '20:00', duration: 60, status: 'free', price: 1_200_000 },
          { time: '21:00', duration: 60, status: 'occupied', price: 1_200_000 },
          { time: '22:00', duration: 60, status: 'held', price: 1_200_000 },
          { time: '23:00', duration: 60, status: 'past', price: null },
        ],
      },
    ],
  })

  beforeEach(() => {
    mocks.getPublicAvailability.mockImplementation(async (_t: PublicTenant, date: string) =>
      availability(date),
    )
  })

  describe('rango [hoy, hoy + bookingAdvanceDays]', () => {
    // Hoy = sáb 2026-10-24, anticipación 3 → 24, 25, 26 y 27.
    it.each(['2026-10-24', '2026-10-25', '2026-10-27'])(
      'acepta %s (dentro del rango)',
      async (fecha) => {
        const out = JSON.parse(await toolNamed(makeContext(), 'ver_disponibilidad').run({ fecha }))
        expect(out.fecha).toBe(fecha)
        expect(mocks.getPublicAvailability).toHaveBeenCalledWith(
          expect.objectContaining({ id: TENANT_ID }),
          fecha,
        )
      },
    )

    it.each([
      ['ayer', '2026-10-23'],
      ['hoy + anticipación + 1', '2026-10-28'],
      ['el año pasado', '2025-10-24'],
      ['dentro de un año', '2027-10-24'],
    ])(
      'rechaza %s (%s) con fecha_fuera_de_rango y sin consultar la disponibilidad',
      async (_n, fecha) => {
        const out = await toolNamed(makeContext(), 'ver_disponibilidad').run({ fecha })
        expect(JSON.parse(out)).toEqual({ error: 'fecha_fuera_de_rango' })
        expect(mocks.getPublicAvailability).not.toHaveBeenCalled()
      },
    )

    it('anticipación 0: solo hoy', async () => {
      const ctx = makeContext({ tenant: makeTenant({ bookingAdvanceDays: 0 }) })
      const tool = toolNamed(ctx, 'ver_disponibilidad')
      expect(JSON.parse(await tool.run({ fecha: '2026-10-24' })).fecha).toBe('2026-10-24')
      expect(JSON.parse(await tool.run({ fecha: '2026-10-25' }))).toEqual({
        error: 'fecha_fuera_de_rango',
      })
    })

    it('el rango parte del día OPERATIVO: a las 00:30 del sábado con cierre 02:00, hoy es el viernes', async () => {
      const ctx = makeContext({
        now: new Date('2026-10-24T03:30:00Z'), // sáb 00:30 ART
        tenant: makeTenant({
          closesNextDay: true,
          openingHours: {
            ...makeTenant().openingHours,
            fri: day('08:00', '02:00'),
            sat: day('08:00', '02:00'),
          },
        }),
      })
      const tool = toolNamed(ctx, 'ver_disponibilidad')
      expect(JSON.parse(await tool.run({ fecha: '2026-10-23' })).fecha).toBe('2026-10-23')
      expect(JSON.parse(await tool.run({ fecha: '2026-10-26' })).fecha).toBe('2026-10-26')
      expect(JSON.parse(await tool.run({ fecha: '2026-10-27' }))).toEqual({
        error: 'fecha_fuera_de_rango',
      })
      expect(JSON.parse(await tool.run({ fecha: '2026-10-22' }))).toEqual({
        error: 'fecha_fuera_de_rango',
      })
    })

    // `dateOutOfRange` compara strings: una fecha imposible que cae
    // lexicográficamente dentro del rango ("2026-10-32" entre "2026-10-30" y
    // "2026-11-05") pasaba todos los filtros y tiraba un TypeError, que pasaba
    // la charla a una persona. `dateSchema` valida con `isValidCalendarDate`.
    it('una fecha imposible dentro del rango no tumba el turno con un TypeError', async () => {
      const ctx = makeContext({
        now: new Date('2026-10-30T15:00:00Z'),
        tenant: makeTenant({ bookingAdvanceDays: 6 }),
      })
      const out = await outcomeOf(toolNamed(ctx, 'ver_disponibilidad'), { fecha: '2026-10-32' })
      const crashed = out instanceof Error && !(out instanceof ToolInputError)
      expect(crashed).toBe(false)
    })

    // Misma causa: "2026-11-31" no existe y `new Date` lo rodaba a 1/12; la
    // fecha inválida llegaba tal cual a `getPublicAvailability` y al `::date`.
    it('una fecha que no existe en el calendario no llega a getPublicAvailability', async () => {
      const ctx = makeContext({
        now: new Date('2026-11-28T15:00:00Z'),
        tenant: makeTenant({ bookingAdvanceDays: 6 }),
      })
      await outcomeOf(toolNamed(ctx, 'ver_disponibilidad'), { fecha: '2026-11-31' })
      expect(mocks.getPublicAvailability).not.toHaveBeenCalled()
    })
  })

  describe('input inválido → ToolInputError', () => {
    it.each([
      ['fecha con barras', { fecha: '24/10/2026' }],
      ['fecha sin ceros', { fecha: '2026-1-5' }],
      ['fecha vacía', { fecha: '' }],
      ['sin fecha', {}],
      ['fecha no string', { fecha: 20261024 }],
      ['campo extra (tenant_id)', { fecha: '2026-10-24', tenant_id: OTHER_TENANT_ID }],
      ['input null', null],
      ['input string', '2026-10-24'],
    ])('%s', async (_name, input) => {
      const out = await outcomeOf(toolNamed(makeContext(), 'ver_disponibilidad'), input)
      expect(out).toBeInstanceOf(ToolInputError)
      expect(mocks.getPublicAvailability).not.toHaveBeenCalled()
    })
  })

  describe('resultado', () => {
    it('lista solo los turnos libres, con su precio formateado', async () => {
      const out = JSON.parse(
        await toolNamed(makeContext(), 'ver_disponibilidad').run({ fecha: '2026-10-25' }),
      )
      expect(out.canchas).toHaveLength(1)
      expect(out.canchas[0]).toEqual({
        nombre: 'Cancha 1',
        formato: 'fútbol 5',
        turnos_libres: expect.any(Array),
      })
      expect(out.canchas[0].turnos_libres).toEqual([
        { hora: '20:00', precio: expect.stringMatching(/12\.000/) },
      ])
    })

    it('con hidePrices los turnos no llevan precio', async () => {
      const ctx = makeContext({ tenant: makeTenant({ hidePrices: true }) })
      const out = JSON.parse(
        await toolNamed(ctx, 'ver_disponibilidad').run({ fecha: '2026-10-25' }),
      )
      expect(out.canchas[0].turnos_libres).toEqual([{ hora: '20:00' }])
    })

    it('día en la lista de cerrados → cerrado: true sin consultar disponibilidad', async () => {
      const ctx = makeContext({ tenant: makeTenant({ closedDates: ['2026-10-25'] }) })
      const out = JSON.parse(
        await toolNamed(ctx, 'ver_disponibilidad').run({ fecha: '2026-10-25' }),
      )
      expect(out).toEqual({ fecha: '2026-10-25', cerrado: true, canchas: [] })
      expect(mocks.getPublicAvailability).not.toHaveBeenCalled()
    })

    it('día de la semana que el complejo no abre → cerrado: true (2026-10-25 es domingo)', async () => {
      const base = makeTenant()
      const ctx = makeContext({
        tenant: makeTenant({
          openingHours: { ...base.openingHours, sun: { ...day('08:00', '23:00'), closed: true } },
        }),
      })
      const out = JSON.parse(
        await toolNamed(ctx, 'ver_disponibilidad').run({ fecha: '2026-10-25' }),
      )
      expect(out).toEqual({ fecha: '2026-10-25', cerrado: true, canchas: [] })
      expect(mocks.getPublicAvailability).not.toHaveBeenCalled()
    })

    it('reservas online apagadas → reservas_online_cerradas', async () => {
      const ctx = makeContext({ tenant: makeTenant({ allowOnlineBooking: false }) })
      const out = await toolNamed(ctx, 'ver_disponibilidad').run({ fecha: '2026-10-25' })
      expect(JSON.parse(out)).toEqual({ error: 'reservas_online_cerradas' })
      expect(mocks.getPublicAvailability).not.toHaveBeenCalled()
    })

    it('complejo que cierra de madrugada: los turnos antes de la apertura se marcan como del día siguiente', async () => {
      const ctx = makeContext({
        tenant: makeTenant({
          closesNextDay: true,
          openingHours: {
            ...makeTenant().openingHours,
            sun: day('08:00', '02:00'),
          },
        }),
      })
      mocks.getPublicAvailability.mockResolvedValue({
        date: '2026-10-25',
        courts: [
          {
            id: COURT_ID,
            name: 'Cancha 1',
            format: 5,
            slots: [
              { time: '23:00', duration: 60, status: 'free', price: 100 },
              { time: '00:00', duration: 60, status: 'free', price: 100 },
              { time: '01:00', duration: 60, status: 'free', price: 100 },
            ],
          },
        ],
      })
      const out = JSON.parse(
        await toolNamed(ctx, 'ver_disponibilidad').run({ fecha: '2026-10-25' }),
      )
      expect(out.canchas[0].turnos_libres).toEqual([
        { hora: '23:00', precio: expect.any(String) },
        { hora: '00:00', precio: expect.any(String), madrugada_del_dia_siguiente: true },
        { hora: '01:00', precio: expect.any(String), madrugada_del_dia_siguiente: true },
      ])
    })

    it('sin closesNextDay nunca marca madrugada', async () => {
      const out = JSON.parse(
        await toolNamed(makeContext(), 'ver_disponibilidad').run({ fecha: '2026-10-25' }),
      )
      expect(JSON.stringify(out)).not.toContain('madrugada')
    })
  })
})
