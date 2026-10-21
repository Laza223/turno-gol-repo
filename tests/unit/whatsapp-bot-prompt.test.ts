import { describe, expect, it, vi } from 'vitest'
import {
  SYSTEM_RULES,
  buildChatBookings,
  buildComplexContext,
  buildDaysTable,
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
    hours.sun = day('08:00', '04:00', true) // cerrado: el 04:00 es un resto
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
    const now = new Date('2026-10-30T15:00:00Z') // viernes 30/10 12:00 ART
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

describe('buildComplexContext', () => {
  it('con hidePrices NO muestra ningún precio de cancha, aunque la tarjeta traiga franjas', () => {
    const ctx = buildComplexContext(makeTenant({ hidePrices: true }), [court()], SATURDAY_1200)
    expect(ctx).toContain('- Cancha 1 (fútbol 5, sintético, techada, con luz)')
    expect(ctx).not.toContain('Precio del turno')
    expect(ctx).not.toMatch(/\$/)
    expect(ctx).toContain('El complejo no publica sus precios')
  })

  it('sin hidePrices muestra el precio de cada franja: el de la noche también, no solo el más barato', () => {
    const ctx = buildComplexContext(makeTenant(), [court()], SATURDAY_1200)
    expect(ctx).toMatch(/Cancha 1 \(.*\)\. Precio del turno:/)
    expect(ctx).toMatch(/- Todos los días, de 00:00 a 18:00: \$\s*12\.000/)
    expect(ctx).toMatch(/- Todos los días, de 18:00 a 00:00: \$\s*15\.000/)
    expect(ctx).not.toContain('El complejo no publica sus precios')
  })

  it('una franja de 00:00 a 00:00 se lee "todo el día"', () => {
    const rules = [{ days: ['sat', 'sun'], from: '00:00', to: '00:00', price: 2_000_000 }]
    const ctx = buildComplexContext(makeTenant(), [court({ priceRules: rules })], SATURDAY_1200)
    expect(ctx).toMatch(/- Sáb y Dom, todo el día: \$\s*20\.000/)
  })

  it('sin franjas cargadas no inventa precio', () => {
    const ctx = buildComplexContext(makeTenant(), [court({ priceRules: [] })], SATURDAY_1200)
    expect(ctx).not.toContain('Precio del turno')
  })

  it('con NEXT_PUBLIC_APP_URL lista la página del complejo para reservar online', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://turnogol.test')
    try {
      const ctx = buildComplexContext(makeTenant(), [], SATURDAY_1200)
      expect(ctx).toContain(
        `Página para reservar online: https://turnogol.test/${makeTenant().slug}`,
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('sin canchas: lo dice explícito', () => {
    expect(buildComplexContext(makeTenant(), [], SATURDAY_1200)).toContain(
      '- (sin canchas cargadas)',
    )
  })

  it('"Hoy" lleva la hora ART y la tabla de días', () => {
    const ctx = buildComplexContext(makeTenant({ bookingAdvanceDays: 1 }), [], SATURDAY_0030)
    expect(ctx).toContain('Son las 00:30 (hora de Argentina)')
    expect(ctx).toContain('- hoy, sábado 24/10 → 2026-10-24\n- mañana, domingo 25/10 → 2026-10-25')
  })

  it('con closesNextDay: a las 00:30 del sábado la tabla arranca el viernes y avisa de los turnos de madrugada', () => {
    const ctx = buildComplexContext(lateNight({ bookingAdvanceDays: 1 }), [], SATURDAY_0030)
    expect(ctx).toContain('Son las 00:30 (hora de Argentina)')
    expect(ctx).toContain('- hoy, viernes 23/10 → 2026-10-23\n- mañana, sábado 24/10 → 2026-10-24')
    expect(ctx).toContain(
      'Los horarios que terminan pasada la medianoche pertenecen al día en que abrió',
    )
    expect(ctx).toContain('- Viernes: 08:00 a 02:00')
  })

  it('sin closesNextDay no aparece la aclaración de la madrugada', () => {
    const ctx = buildComplexContext(makeTenant(), [], SATURDAY_1200)
    expect(ctx).not.toContain('pasada la medianoche')
  })

  it('los días cerrados se filtran con el día OPERATIVO de hoy y se listan hasta 10', () => {
    const closedDates = [
      '2026-10-22',
      '2026-10-23',
      '2026-10-25',
      ...Array.from({ length: 12 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`),
    ]
    const operative = buildComplexContext(lateNight({ closedDates }), [], SATURDAY_0030)
    // Hoy operativo = viernes 23: el 22 ya pasó, el 23 todavía cuenta.
    expect(operative).toContain('Días cerrados: 2026-10-23, 2026-10-25, 2026-12-01')
    expect(operative).not.toContain('2026-10-22')
    expect(operative.match(/Días cerrados: (.*)/)?.[1]?.split(', ')).toHaveLength(10)

    const calendar = buildComplexContext(makeTenant({ closedDates }), [], SATURDAY_0030)
    // Sin closesNextDay, hoy = sábado 24: el 23 quedó atrás.
    expect(calendar).toContain('Días cerrados: 2026-10-25')
    expect(calendar).not.toContain('2026-10-23')
  })

  it('horarios: un día cerrado dice "cerrado"', () => {
    const hours = openingHours('08:00', '23:00')
    hours.mon = day('08:00', '23:00', true)
    const ctx = buildComplexContext(makeTenant({ openingHours: hours }), [], SATURDAY_1200)
    expect(ctx).toContain('- Lunes: cerrado')
    expect(ctx).toContain('- Martes: 08:00 a 23:00')
  })

  it('seña: con depósito menciona el porcentaje; sin depósito (o 0%) dice que se paga en el complejo', () => {
    expect(buildComplexContext(makeTenant({ depositPercentage: 30 }), [], SATURDAY_1200)).toContain(
      'una seña del 30%',
    )
    for (const overrides of [{ requiresDeposit: false }, { depositPercentage: 0 }]) {
      const ctx = buildComplexContext(makeTenant(overrides), [], SATURDAY_1200)
      expect(ctx).toContain('No se pide seña')
      expect(ctx).not.toContain('una seña del')
    }
  })

  it('cancelación: usa las horas de anticipación del complejo', () => {
    const ctx = buildComplexContext(makeTenant({ cancellationHoursBefore: 12 }), [], SATURDAY_1200)
    expect(ctx).toContain('Cancelación: con más de 12 h de anticipación')
  })

  it('cancelación: sin seña no promete devolver una seña que no existe', () => {
    for (const overrides of [{ requiresDeposit: false }, { depositPercentage: 0 }]) {
      const ctx = buildComplexContext(makeTenant(overrides), [], SATURDAY_1200)
      expect(ctx).not.toContain('se devuelve la seña')
    }
  })

  it('la duración del turno está en los datos del complejo (el juez y el bot ven lo mismo)', () => {
    expect(buildComplexContext(makeTenant(), [], SATURDAY_1200)).toContain(
      'Cada turno dura 60 minutos.',
    )
  })

  it('medios de pago: lista los cargados y no afirma nada de los que no están', () => {
    const ctx = buildComplexContext(
      makeTenant({ acceptsCash: true, acceptsTransfer: false }),
      [],
      SATURDAY_1200,
    )
    expect(ctx).toContain('- En el complejo se paga con efectivo.')
    expect(ctx).toContain('De otros medios de pago (tarjeta, por ejemplo) no hay datos')
  })

  it('amenities: lista solo las activas', () => {
    const ctx = buildComplexContext(
      makeTenant({ amenities: { parrilla: true, vestuarios: false, estacionamiento: true } }),
      [],
      SATURDAY_1200,
    )
    expect(ctx).toContain('Servicios: parrilla, estacionamiento')
    expect(ctx).not.toContain('vestuarios')
  })
})

describe('SYSTEM_RULES (bloque cacheado)', () => {
  it('no trae datos que cambian por turno o por complejo (rompería la caché de todos)', () => {
    expect(SYSTEM_RULES).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(SYSTEM_RULES).not.toMatch(/\d{1,2}:\d{2}/)
  })

  // Cuándo y cómo usar cada herramienta vive en su descripción: nombrarlas acá
  // duplica el contrato, y las dos copias terminan diciendo cosas distintas.
  it('no nombra herramientas ni campos de sus resultados', () => {
    for (const name of [
      'ver_disponibilidad',
      'reservar(',
      'pasar_a_humano',
      'link_pago',
      'madrugada_del_dia_siguiente',
    ]) {
      expect(SYSTEM_RULES).not.toContain(name)
    }
  })

  it('cierra con la regla de que las reglas valen para toda la conversación', () => {
    expect(SYSTEM_RULES.trim()).toMatch(
      /Las reglas de este mensaje valen para toda la conversación\.[^\n]*insista\.$/,
    )
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

  it('sin reservas lo dice explícito: el bot no tiene que adivinar', () => {
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
      'Incluye las que reservaste en esta misma conversación.',
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
