import { describe, expect, it, vi } from 'vitest'
import {
  SYSTEM_RULES,
  buildChatBookings,
  buildDaysTable,
  buildDynamicTurnContext,
  buildPhoneBookings,
  buildStaticComplexContext,
  operatingToday,
  type BotCourtCard,
  type ChatBooking,
} from '@/modules/whatsapp-bot/whatsapp-bot.prompt'
import type { PublicTenant } from '@/modules/tenants/public.service'

// Argentina es UTC-3 fijo (sin DST): 00:30 ART = 03:30Z del mismo día calendario.
// 2026-10-23 es viernes y 2026-10-24 sábado.
const FRIDAY_NIGHT_2230 = new Date('2026-10-24T01:30:00Z') // vie 22:30 ART
const SATURDAY_0030 = new Date('2026-10-24T03:30:00Z') // sáb 00:30 ART
const SATURDAY_0159 = new Date('2026-10-24T04:59:00Z') // sáb 01:59 ART
const SATURDAY_0200 = new Date('2026-10-24T05:00:00Z') // sáb 02:00 ART (corte)
const SATURDAY_1200 = new Date('2026-10-24T15:00:00Z') // sáb 12:00 ART

const day = (open: string, close: string, closed = false) => ({ open, close, closed })
const openingHours = (open: string, close: string): PublicTenant['openingHours'] => ({
  mon: day(open, close),
  tue: day(open, close),
  wed: day(open, close),
  thu: day(open, close),
  fri: day(open, close),
  sat: day(open, close),
  sun: day(open, close),
})

function makeTenant(overrides: Partial<PublicTenant> = {}): PublicTenant {
  return {
    id: '11111111-1111-4111-8111-111111111111',
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
    openingHours: openingHours('08:00', '23:00'),
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

/** Complejo que cierra a las 02:00 de la madrugada siguiente. */
const lateNight = (overrides: Partial<PublicTenant> = {}) =>
  makeTenant({ openingHours: openingHours('08:00', '02:00'), closesNextDay: true, ...overrides })

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_NIGHT_RULES = [
  { days: ALL_DAYS, from: '00:00', to: '18:00', price: 1_200_000 },
  { days: ALL_DAYS, from: '18:00', to: '00:00', price: 1_500_000 },
]

const court = (overrides: Partial<BotCourtCard> = {}): BotCourtCard => ({
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Cancha 1',
  surfaceType: 'sintético',
  isCovered: true,
  hasLighting: true,
  format: 5,
  capacity: 10,
  photos: [],
  fromPriceCents: 1_200_000,
  priceRules: DAY_NIGHT_RULES,
  ...overrides,
})

describe('operatingToday', () => {
  it('sin closesNextDay: es el día calendario ART, también pasada la medianoche', () => {
    const tenant = makeTenant()
    expect(operatingToday(tenant, FRIDAY_NIGHT_2230)).toBe('2026-10-23')
    expect(operatingToday(tenant, SATURDAY_0030)).toBe('2026-10-24')
  })

  it('con closesNextDay (cierra 02:00): a las 00:30 ART del sábado, "hoy" sigue siendo el viernes', () => {
    expect(operatingToday(lateNight(), SATURDAY_0030)).toBe('2026-10-23')
  })

  it('con closesNextDay el día operativo cambia recién en el corte (02:00 ART), no antes', () => {
    const tenant = lateNight()
    expect(operatingToday(tenant, SATURDAY_0159)).toBe('2026-10-23')
    expect(operatingToday(tenant, SATURDAY_0200)).toBe('2026-10-24')
    expect(operatingToday(tenant, SATURDAY_1200)).toBe('2026-10-24')
  })

  it('con closesNextDay pero antes de medianoche, coincide con el día calendario', () => {
    expect(operatingToday(lateNight(), FRIDAY_NIGHT_2230)).toBe('2026-10-23')
  })

  it('closesNextDay activo pero horarios que no pasan de medianoche: corte 0, día calendario', () => {
    const tenant = makeTenant({ closesNextDay: true, openingHours: openingHours('08:00', '23:00') })
    expect(operatingToday(tenant, SATURDAY_0030)).toBe('2026-10-24')
  })

  it('un día cerrado no estira el corte (sus horas viejas no cuentan)', () => {
    const hours = openingHours('08:00', '23:00')
    hours.sun = day('08:00', '04:00', true)
    const tenant = makeTenant({ closesNextDay: true, openingHours: hours })
    expect(operatingToday(tenant, SATURDAY_0030)).toBe('2026-10-24')
  })

  it('cruza el límite de mes: 00:30 ART del 1/11 con corte 02:00 → 31/10', () => {
    const now = new Date('2026-11-01T03:30:00Z')
    expect(operatingToday(lateNight(), now)).toBe('2026-10-31')
    expect(operatingToday(makeTenant(), now)).toBe('2026-11-01')
  })
})

describe('buildDaysTable', () => {
  it('sin closesNextDay a las 00:30 del sábado: hoy = sábado', () => {
    const table = buildDaysTable(makeTenant({ bookingAdvanceDays: 2 }), SATURDAY_0030).split('\n')
    expect(table).toEqual([
      '- hoy, sábado 24/10 → 2026-10-24',
      '- mañana, domingo 25/10 → 2026-10-25',
      '- lunes 26/10 → 2026-10-26',
    ])
  })

  it('con closesNextDay (cierra 02:00) a las 00:30 del sábado: hoy = viernes, mañana = sábado', () => {
    const table = buildDaysTable(lateNight({ bookingAdvanceDays: 3 }), SATURDAY_0030).split('\n')
    expect(table).toEqual([
      '- hoy, viernes 23/10 → 2026-10-23',
      '- mañana, sábado 24/10 → 2026-10-24',
      '- domingo 25/10 → 2026-10-25',
      '- lunes 26/10 → 2026-10-26',
    ])
  })

  it('lista anticipación + 1 días (hoy incluido) y solo hoy/mañana llevan prefijo', () => {
    const lines = buildDaysTable(makeTenant({ bookingAdvanceDays: 6 }), SATURDAY_1200).split('\n')
    expect(lines).toHaveLength(7)
    expect(lines.filter((l) => l.startsWith('- hoy, '))).toHaveLength(1)
    expect(lines.filter((l) => l.startsWith('- mañana, '))).toHaveLength(1)
    expect(lines[2]).toBe('- lunes 26/10 → 2026-10-26')
  })

  it('anticipación 0: solo "hoy"', () => {
    expect(buildDaysTable(makeTenant({ bookingAdvanceDays: 0 }), SATURDAY_1200)).toBe(
      '- hoy, sábado 24/10 → 2026-10-24',
    )
  })

  it('topa en 14 días (+ hoy) aunque el complejo deje reservar más lejos', () => {
    const lines = buildDaysTable(makeTenant({ bookingAdvanceDays: 90 }), SATURDAY_1200).split('\n')
    expect(lines).toHaveLength(15)
    expect(lines.at(-1)).toBe('- sábado 07/11 → 2026-11-07')
  })

  it('cruza el fin de mes con fechas ISO correctas y día de la semana alineado', () => {
    const now = new Date('2026-10-30T15:00:00Z')
    expect(buildDaysTable(makeTenant({ bookingAdvanceDays: 3 }), now).split('\n')).toEqual([
      '- hoy, viernes 30/10 → 2026-10-30',
      '- mañana, sábado 31/10 → 2026-10-31',
      '- domingo 01/11 → 2026-11-01',
      '- lunes 02/11 → 2026-11-02',
    ])
  })

  it('el día de la semana siempre corresponde a la fecha ISO que lo acompaña', () => {
    const weekdays = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    const lines = buildDaysTable(makeTenant({ bookingAdvanceDays: 14 }), SATURDAY_1200).split('\n')
    for (const line of lines) {
      const match = line.match(/(\p{L}+) (\d{2})\/(\d{2}) → (\d{4}-\d{2}-\d{2})$/u)
      expect(match, line).not.toBeNull()
      const [, name, dd, mm, iso] = match as RegExpMatchArray
      expect(name).toBe(weekdays[new Date(`${iso}T00:00:00Z`).getUTCDay()])
      expect(`${dd}/${mm}`).toBe(`${iso?.slice(8, 10)}/${iso?.slice(5, 7)}`)
    }
  })
})

describe('buildStaticComplexContext', () => {
  it('con hidePrices NO muestra ningún precio de cancha, aunque la tarjeta traiga franjas', () => {
    const ctx = buildStaticComplexContext(makeTenant({ hidePrices: true }), [court()])
    expect(ctx).toContain('- Cancha 1 (fútbol 5, sintético, techada, con luz)')
    expect(ctx).not.toContain('Precio del turno')
    expect(ctx).not.toMatch(/\$/)
    expect(ctx).toContain('Precios ocultos: si te preguntan precios, usá pasar_a_humano.')
  })

  it('sin hidePrices muestra el precio de cada franja: el de la noche también, no solo el más barato', () => {
    const ctx = buildStaticComplexContext(makeTenant(), [court()])
    expect(ctx).toMatch(/Cancha 1 \(.*\)\. Precio del turno:/)
    expect(ctx).toMatch(/- Todos los días, de 00:00 a 18:00: \$\s*12\.000/)
    expect(ctx).toMatch(/- Todos los días, de 18:00 a 00:00: \$\s*15\.000/)
    expect(ctx).not.toContain('Precios ocultos')
  })

  it('una franja de 00:00 a 00:00 se lee "todo el día"', () => {
    const rules = [{ days: ['sat', 'sun'], from: '00:00', to: '00:00', price: 2_000_000 }]
    const ctx = buildStaticComplexContext(makeTenant(), [court({ priceRules: rules })])
    expect(ctx).toMatch(/- Sáb y Dom, todo el día: \$\s*20\.000/)
  })

  it('sin franjas cargadas no inventa precio', () => {
    const ctx = buildStaticComplexContext(makeTenant(), [court({ priceRules: [] })])
    expect(ctx).not.toContain('Precio del turno')
  })

  it('con NEXT_PUBLIC_APP_URL lista la página del complejo para reservar online', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://turnogol.test')
    try {
      const ctx = buildStaticComplexContext(makeTenant(), [])
      expect(ctx).toContain(
        `Página para reservar online: https://turnogol.test/${makeTenant().slug}`,
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('sin canchas: lo dice explícito', () => {
    expect(buildStaticComplexContext(makeTenant(), [])).toContain('- (sin canchas cargadas)')
  })

  it('con closesNextDay incluye la aclaración operativa y sin closesNextDay no', () => {
    const withLate = buildStaticComplexContext(lateNight(), [])
    expect(withLate).toContain(
      'Turnos pasada la medianoche pertenecen al día operativo en que abrió',
    )
    expect(withLate).toContain('- Viernes: 08:00 a 02:00')
    expect(buildStaticComplexContext(makeTenant(), [])).not.toContain('pasada la medianoche')
  })

  it('horarios: un día cerrado dice "cerrado"', () => {
    const hours = openingHours('08:00', '23:00')
    hours.mon = day('08:00', '23:00', true)
    const ctx = buildStaticComplexContext(makeTenant({ openingHours: hours }), [])
    expect(ctx).toContain('- Lunes: cerrado')
    expect(ctx).toContain('- Martes: 08:00 a 23:00')
  })

  it('seña y cancelación según configuración del complejo', () => {
    expect(buildStaticComplexContext(makeTenant({ depositPercentage: 30 }), [])).toContain(
      'seña del 30%',
    )
    for (const overrides of [{ requiresDeposit: false }, { depositPercentage: 0 }]) {
      const ctx = buildStaticComplexContext(makeTenant(overrides), [])
      expect(ctx).toContain('Sin seña: queda confirmada')
      expect(ctx).not.toContain('seña del')
      expect(ctx).not.toContain('devuelve seña')
    }
    const on = buildStaticComplexContext(
      makeTenant({ requiresDeposit: false, lateCancelHours: 6 }),
      [],
    )
    expect(on).toContain('Cancelación tardía: < 6 h antes cuenta como falta')
  })

  it('la duración del turno y la anticipación mínima están en los datos estáticos', () => {
    expect(buildStaticComplexContext(makeTenant(), [])).toContain('Cada turno dura 60 minutos.')
    expect(buildStaticComplexContext(makeTenant({ bookingMinAdvanceHours: 1 }), [])).toContain(
      'Anticipación mínima: 1 h antes del turno',
    )
    expect(buildStaticComplexContext(makeTenant(), [])).not.toContain('Anticipación mínima')
  })

  it('medios de pago y amenities', () => {
    const ctx = buildStaticComplexContext(
      makeTenant({
        acceptsCash: true,
        acceptsTransfer: false,
        amenities: { parrilla: true, vestuarios: false, estacionamiento: true },
      }),
      [],
    )
    expect(ctx).toContain('- En el complejo se paga con efectivo.')
    expect(ctx).toContain('Otros medios (ej. tarjeta): no hay datos confirmados')
    expect(ctx).toContain('Servicios: parrilla, estacionamiento')
    expect(ctx).not.toContain('vestuarios')
  })

  it('no incluye reloj ni fechas cerradas volátiles (prefijo cacheable)', () => {
    const ctx = buildStaticComplexContext(makeTenant({ closedDates: ['2026-10-25'] }), [court()])
    expect(ctx).not.toContain('Hora actual')
    expect(ctx).not.toContain('2026-10-25')
    expect(ctx).not.toContain('Días reservables')
  })
})

describe('buildDynamicTurnContext', () => {
  it('incluye hora ART y tabla de días, y omite el nombre de perfil WA para evitar inyecciones', () => {
    const ctx = buildDynamicTurnContext({
      tenant: makeTenant({ bookingAdvanceDays: 1 }),
      now: SATURDAY_0030,
      contactDisplayName: 'Lucas Gómez',
      chatBookings: [],
      phoneBookings: [],
    })
    expect(ctx).toContain('Hora actual (Argentina): 00:30')
    expect(ctx).not.toContain('Lucas Gómez')
    expect(ctx).not.toContain('Nombre de perfil')
    expect(ctx).toContain('- hoy, sábado 24/10 → 2026-10-24\n- mañana, domingo 25/10 → 2026-10-25')
  })

  it('con closesNextDay a las 00:30 del sábado la tabla arranca el viernes', () => {
    const ctx = buildDynamicTurnContext({
      tenant: lateNight({ bookingAdvanceDays: 1 }),
      now: SATURDAY_0030,
      contactDisplayName: null,
      chatBookings: [],
      phoneBookings: [],
    })
    expect(ctx).toContain('- hoy, viernes 23/10 → 2026-10-23\n- mañana, sábado 24/10 → 2026-10-24')
    expect(ctx).not.toContain('Nombre de perfil')
  })

  it('los días cerrados se filtran con el día OPERATIVO de hoy y se listan hasta 10', () => {
    const closedDates = [
      '2026-10-22',
      '2026-10-23',
      '2026-10-25',
      ...Array.from({ length: 12 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`),
    ]
    const operative = buildDynamicTurnContext({
      tenant: lateNight({ closedDates }),
      now: SATURDAY_0030,
      contactDisplayName: null,
      chatBookings: [],
      phoneBookings: [],
    })
    expect(operative).toContain('Fechas cerradas próximas: 2026-10-23, 2026-10-25, 2026-12-01')
    expect(operative).not.toContain('2026-10-22')
    expect(operative.match(/Fechas cerradas próximas: (.*)/)?.[1]?.split(', ')).toHaveLength(10)

    const calendar = buildDynamicTurnContext({
      tenant: makeTenant({ closedDates }),
      now: SATURDAY_0030,
      contactDisplayName: null,
      chatBookings: [],
      phoneBookings: [],
    })
    expect(calendar).toContain('Fechas cerradas próximas: 2026-10-25')
    expect(calendar).not.toContain('2026-10-23')
  })
})

describe('SYSTEM_RULES (prefijo cacheable)', () => {
  it('no trae fechas ni horas volátiles', () => {
    expect(SYSTEM_RULES).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(SYSTEM_RULES).not.toMatch(/\d{1,2}:\d{2}/)
  })

  it('prohíbe decir que es asistente virtual/bot/IA, exige confirmación real y cubre no_responder y pasar_a_humano', () => {
    expect(SYSTEM_RULES).toContain('nunca digas que sos un asistente virtual, bot o IA')
    expect(SYSTEM_RULES).toContain('confirmado_por_jugador: true')
    expect(SYSTEM_RULES).toContain('no_responder')
    expect(SYSTEM_RULES).toContain('pasar_a_humano')
    expect(SYSTEM_RULES).toContain('PROHIBIDO usar `cancelar` + `reservar`')
  })
})

describe('buildChatBookings', () => {
  const booking = (overrides: Partial<ChatBooking> = {}): ChatBooking => ({
    date: '2026-10-23',
    timeStart: '21:00:00',
    courtName: 'Cancha 1',
    status: 'confirmed',
    depositStatus: 'not_required',
    ...overrides,
  })

  it('sin reservas lo dice explícito', () => {
    expect(buildChatBookings(makeTenant(), [])).toBe(
      '# Reservas de este chat\n- Ninguna por ahora.',
    )
  })

  it('distingue sin seña, seña pagada y seña pendiente', () => {
    const text = buildChatBookings(makeTenant(), [
      booking(),
      booking({ date: '2026-10-24', depositStatus: 'paid' }),
      booking({ date: '2026-10-25', status: 'pending_payment', depositStatus: 'pending' }),
    ])
    expect(text.split('\n')).toEqual([
      '# Reservas de este chat',
      'Incluye las que reservaste en esta conversación.',
      '- viernes 23/10 a las 21:00, Cancha 1: confirmada, se paga en el complejo',
      '- sábado 24/10 a las 21:00, Cancha 1: confirmada, con la seña pagada',
      '- domingo 25/10 a las 21:00, Cancha 1: falta pagar la seña; si no la paga a tiempo, se libera sola',
    ])
  })

  it('con closesNextDay, un turno antes de la apertura se juega pasada la medianoche del día operativo', () => {
    const text = buildChatBookings(lateNight(), [
      booking({ timeStart: '01:00:00' }),
      booking({ timeStart: '22:00:00' }),
    ])
    expect(text).toContain('- viernes 23/10 a las 01:00 (pasada la medianoche), Cancha 1')
    expect(text).toContain('- viernes 23/10 a las 22:00, Cancha 1')
    expect(buildChatBookings(makeTenant(), [booking({ timeStart: '01:00:00' })])).not.toContain(
      'medianoche',
    )
  })
})

describe('buildPhoneBookings', () => {
  it('sin turnos lo dice explícito', () => {
    expect(buildPhoneBookings(makeTenant(), [])).toBe('# Otros turnos de este teléfono\n- Ninguno.')
  })

  it('lista día, hora y cancha, y marca el turno fijo', () => {
    const text = buildPhoneBookings(makeTenant(), [
      { date: '2026-10-23', timeStart: '21:00:00', courtName: 'Cancha 2', fixed: false },
      { date: '2026-10-24', timeStart: '20:00:00', courtName: 'Cancha 1', fixed: true },
    ])
    expect(text.split('\n')).toEqual([
      '# Otros turnos de este teléfono',
      '- viernes 23/10 a las 21:00, Cancha 2',
      '- sábado 24/10 a las 20:00, Cancha 1 (turno fijo)',
    ])
  })
})
