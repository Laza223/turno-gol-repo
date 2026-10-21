import { faker } from '@faker-js/faker'
import { addDays, artTodayStr } from '@/shared/dates/art'
import { BOT_FEATURE_FLAG } from '@/modules/whatsapp-bot/whatsapp-bot.connection'
import { adminSql } from '../helpers/admin-db'
import { createTestStaffUser, createTestTenant, linkStaffToTenant } from '../helpers/tenant'
import { insertBooking, insertWhatsappChat, insertWhatsappConnection } from '../helpers/factories'

/**
 * Complejo de fútbol inventado para el banco de pruebas del bot. Ningún dato es
 * de un cliente real: nombre, dirección y precios son de muestra, pero con la
 * forma de un complejo del conurbano (tres canchas, precio por franja, bar).
 */

type DayHours = { open: string; close: string; closed?: boolean }
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/** Pesos → centavos, para leer los precios de abajo sin contar ceros. */
const ars = (pesos: number) => pesos * 100

type CourtSeed = {
  name: string
  format: number
  isCovered: boolean
  /** Precio del turno antes y después de las 18:00. */
  day: number
  night: number
}

const BASE_COURTS: CourtSeed[] = [
  { name: 'Cancha 1', format: 5, isCovered: true, day: ars(28_000), night: ars(35_000) },
  { name: 'Cancha 2', format: 5, isCovered: false, day: ars(25_000), night: ars(32_000) },
  { name: 'Cancha 3', format: 7, isCovered: false, day: ars(40_000), night: ars(50_000) },
]

const BASE_HOURS: Record<(typeof DAY_KEYS)[number], DayHours> = {
  mon: { open: '10:00', close: '23:00' },
  tue: { open: '10:00', close: '23:00' },
  wed: { open: '10:00', close: '23:00' },
  thu: { open: '10:00', close: '23:00' },
  fri: { open: '10:00', close: '23:00' },
  sat: { open: '09:00', close: '23:00' },
  sun: { open: '10:00', close: '22:00' },
}

/** Complejo que abre de noche y cierra pasada la medianoche (`closes_next_day`). */
const NIGHT_HOURS = Object.fromEntries(
  DAY_KEYS.map((k) => [k, { open: '18:00', close: '02:00' }]),
) as Record<(typeof DAY_KEYS)[number], DayHours>

export type ComplexVariant = {
  deposit?: boolean
  hidePrices?: boolean
  night?: boolean
  advanceDays?: number
  /** Días cerrados, en días desde hoy (ART). */
  closedInDays?: number[]
}

export type BenchSeed = {
  tenantId: string
  slug: string
  phoneNumberId: string
  /** Teléfono del jugador simulado: solo dígitos, como lo manda Meta. */
  phone: string
  courts: { id: string; name: string; format: number }[]
}

const BASE_SETTINGS = {
  requires_deposit: false,
  deposit_percentage: 30,
  cancellation_policy: { hours_before: 12, penalty_type: 'deposit', penalty_amount: null },
  accepts_cash: true,
  accepts_transfer: true,
  accepts_mercadopago: true,
  allow_online_booking: true,
  booking_advance_days: 14,
  auto_complete_minutes: 30,
  onboarding_completed: true,
}

function pricingOf(court: CourtSeed, night: boolean) {
  const days = [...DAY_KEYS]
  // El complejo nocturno cobra lo mismo toda la noche, madrugada incluida.
  if (night) return { rules: [{ days, from: '00:00', to: '00:00', price: court.night }] }
  return {
    rules: [
      { days, from: '00:00', to: '18:00', price: court.day },
      { days, from: '18:00', to: '00:00', price: court.night },
    ],
  }
}

/** Un complejo nuevo por conversación: nada se cruza entre casos ni repeticiones. */
export async function seedComplex(variant: ComplexVariant = {}): Promise<BenchSeed> {
  const sql = adminSql()
  const tenant = await createTestTenant(sql, { name: 'Complejo La Redonda' })
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id, 'admin')

  const settings = {
    ...BASE_SETTINGS,
    requires_deposit: variant.deposit ?? false,
    booking_advance_days: variant.advanceDays ?? BASE_SETTINGS.booking_advance_days,
    ...(variant.hidePrices ? { hide_public_prices: true } : {}),
  }
  const closedDates = (variant.closedInDays ?? []).map((n) => addDays(artTodayStr(), n))
  await sql`
    UPDATE tenants
    SET settings = ${sql.json(settings as never)},
        opening_hours = ${sql.json((variant.night ? NIGHT_HOURS : BASE_HOURS) as never)},
        closes_next_day = ${variant.night ?? false},
        closed_dates = ${sql.array(closedDates)}::date[],
        mp_access_token = ${variant.deposit ? 'enc-test-token' : null},
        status = 'active'::tenant_status,
        address = 'Av. de Mayo 1234',
        city = 'Ramos Mejía',
        province = 'Buenos Aires',
        phone = '11 4444-5555',
        description = 'Complejo de fútbol 5 y 7 en Ramos Mejía. Canchas de sintético, bar y parrilla para el tercer tiempo.',
        amenities = ${sql.json({ estacionamiento: true, vestuario: true, duchas: true, bar: true, parrilla: true })}
    WHERE id = ${tenant.id}
  `

  const courtSeeds = variant.night ? [BASE_COURTS[0]!] : BASE_COURTS
  const courts: BenchSeed['courts'] = []
  for (const c of courtSeeds) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO courts (tenant_id, name, format, capacity, is_covered, has_lighting, pricing, status)
      VALUES (
        ${tenant.id}, ${c.name}, ${c.format}, ${c.format * 2}, ${c.isCovered}, true,
        ${sql.json(pricingOf(c, variant.night ?? false))}, 'online'
      )
      RETURNING id
    `
    courts.push({ id: row!.id, name: c.name, format: c.format })
  }

  await insertWhatsappConnection(sql, { tenantId: tenant.id })
  await sql`
    INSERT INTO feature_flags (key, value, tenant_id) VALUES (${BOT_FEATURE_FLAG}, true, ${tenant.id})
  `
  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    phoneNumberId: `pn-${tenant.id}`,
    phone: `54911${faker.string.numeric(8)}`,
    courts,
  }
}

/** El chat ya existe antes del primer mensaje (para sembrarle reservas previas). */
export async function seedChat(s: BenchSeed): Promise<string> {
  return insertWhatsappChat(adminSql(), { tenantId: s.tenantId, waPhone: s.phone })
}

/** Turno ocupado por otra persona (reserva de mostrador, sin chat). */
export async function occupySlot(
  s: BenchSeed,
  args: { courtName: string; date: string; timeStart: string; chatId?: string },
): Promise<void> {
  const court = s.courts.find((c) => c.name === args.courtName)
  if (!court) throw new Error(`seed: no existe ${args.courtName}`)
  const sql = adminSql()
  const id = await insertBooking(sql, {
    tenantId: s.tenantId,
    courtId: court.id,
    date: args.date,
    timeStart: args.timeStart,
    timeEnd: `${String(Number(args.timeStart.slice(0, 2)) + 1).padStart(2, '0')}:00`,
    status: 'confirmed',
  })
  if (args.chatId) {
    await sql`UPDATE bookings SET whatsapp_chat_id = ${args.chatId} WHERE id = ${id}`
  }
}
