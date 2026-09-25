import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { listUnpaidGridBookingsBefore } from '@/app/(admin)/reservas/queries'
import { depositCashFlowDescription } from '@/modules/bookings/booking.charges'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

/**
 * "Turnos no cobrados" de Hoy (`listUnpaidGridBookingsBefore`): el filtro "todavía
 * debe" corre en SQL y tiene que dar el mismo saldo que el núcleo compartido con la
 * Grilla; el orden es el instante físico (el turno de las 00:00 de un complejo que
 * cierra pasada la medianoche es el más reciente de su día) con el id de desempate;
 * y `count`/`pendingCents` cuentan todo aunque `limit` corte la lista.
 */

const PRICE = 800000

/** Día ART (UTC-3) a `offset` días de hoy, como YYYY-MM-DD. */
function artDay(offset: number): string {
  return new Date(Date.now() - 3 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10)
}

const TODAY = artDay(0)
const YESTERDAY = artDay(-1)
const TWO_DAYS_AGO = artDay(-2)

let tenantId: string
let staffId: string
let courtId: string

async function seedBooking(opts: {
  date: string
  timeStart: string
  timeEnd: string
  /** Día calendario del inicio, si no es `date` (turno de madrugada del día operativo). */
  startDay?: string
  status?: string
  depositStatus?: string
  depositAmount?: number
  court?: string
}): Promise<string> {
  const sql = getSql()
  const startDay = opts.startDay ?? opts.date
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
      type, status, price_snapshot, deposit_amount, deposit_status, guest_name
    )
    VALUES (
      ${tenantId}, ${opts.court ?? courtId}, ${opts.date}::date, ${opts.timeStart}, ${opts.timeEnd},
      (${startDay}::date + ${opts.timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${startDay}::date + ${opts.timeStart}::time + interval '1 hour') AT TIME ZONE 'America/Argentina/Buenos_Aires',
      'spontaneous', ${opts.status ?? 'completed'}::booking_status, ${PRICE},
      ${opts.depositAmount ?? 0}, ${opts.depositStatus ?? 'not_required'}, 'Invitado'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function charge(bookingId: string, amount: number, description = 'Cobro turno') {
  const sql = getSql()
  await sql`
    INSERT INTO cash_flows (
      tenant_id, type, category, amount, method, description, booking_id, registered_by, occurred_at
    )
    VALUES (${tenantId}, 'income', 'booking', ${amount}, 'cash', ${description}, ${bookingId}, ${staffId}, NOW())
  `
}

async function newCourt(name: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity) VALUES (${tenantId}, ${name}, 10) RETURNING id
  `
  return rows[0]!.id
}

function list(limit = 50) {
  return withTenantContext(tenantId, (tx) =>
    listUnpaidGridBookingsBefore(tenantId, TODAY, tx, { limit }),
  )
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  const tenant = await createTestTenant(sql)
  tenantId = tenant.id
  const staff = await createTestStaffUser(sql)
  staffId = staff.id
  await linkStaffToTenant(sql, tenantId, staffId)
  courtId = await newCourt('Cancha 1')
}, 30_000)

afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('listUnpaidGridBookingsBefore', () => {
  it('filtra, ordena por instante físico y cuenta todo aunque corte la lista', async () => {
    const court2 = await newCourt('Cancha 2')

    // Debe todo, dos días atrás.
    const old = await seedBooking({ date: TWO_DAYS_AGO, timeStart: '20:00', timeEnd: '21:00' })
    // Ayer 23:00 en dos canchas: empate de horario, desempata el id.
    const tieA = await seedBooking({ date: YESTERDAY, timeStart: '23:00', timeEnd: '24:00' })
    const tieB = await seedBooking({
      date: YESTERDAY,
      timeStart: '23:00',
      timeEnd: '24:00',
      court: court2,
    })
    // Ayer 00:00 del día operativo = hoy a la madrugada: el más reciente de todos.
    const lateNight = await seedBooking({
      date: YESTERDAY,
      timeStart: '00:00',
      timeEnd: '01:00',
      startDay: TODAY,
    })
    // Seña pagada + su reflejo en caja + un cobro parcial: debe 800.000 − 200.000 − 100.000.
    const withDeposit = await seedBooking({
      date: YESTERDAY,
      timeStart: '18:00',
      timeEnd: '19:00',
      depositStatus: 'paid',
      depositAmount: 200000,
    })
    await charge(withDeposit, 200000, depositCashFlowDescription(withDeposit))
    await charge(withDeposit, 100000)
    // Pagado entero: no aparece.
    const paid = await seedBooking({ date: YESTERDAY, timeStart: '17:00', timeEnd: '18:00' })
    await charge(paid, PRICE)
    // De hoy o sin jugar: no aparecen.
    await seedBooking({ date: TODAY, timeStart: '10:00', timeEnd: '11:00' })
    await seedBooking({
      date: YESTERDAY,
      timeStart: '15:00',
      timeEnd: '16:00',
      status: 'confirmed',
    })

    const all = await list()
    const [firstTie, secondTie] = [tieA, tieB].sort().reverse()
    expect(all.bookings.map((b) => b.id)).toEqual([
      lateNight,
      firstTie,
      secondTie,
      withDeposit,
      old,
    ])
    expect(all.count).toBe(5)
    expect(all.pendingCents).toBe(4 * PRICE + 500000)
    expect(all.bookings.find((b) => b.id === withDeposit)?.pending).toBe(500000)

    // Con `limit` la lista se corta pero el total no.
    const cut = await list(2)
    expect(cut.bookings.map((b) => b.id)).toEqual([lateNight, firstTie])
    expect(cut.count).toBe(5)
    expect(cut.pendingCents).toBe(all.pendingCents)
  })
})
