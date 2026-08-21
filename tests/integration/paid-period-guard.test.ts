import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createManualBooking, createOnlineBooking } from '@/modules/bookings/booking.service'
import { rescheduleBooking } from '@/modules/bookings/booking.reschedule'
import { createAbonado } from '@/modules/abonados/abonado.service'
import { reserveTournamentSlots } from '@/modules/tournaments/tournament-slots.service'
import { BookingDateOutOfRangeError } from '@/modules/bookings/booking.errors'
import { addDays, artTodayStr } from '@/shared/dates/art'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'
import { getOrCreatePlanId, insertTournament } from '../helpers/factories'

/**
 * El tope de fecha de un complejo dado de baja, del lado de ESCRITURA.
 *
 * La contraparte pública (que el portal siga abierto hasta el fin del período)
 * vive en `public-portal-canceled-gate.test.ts`. Acá se prueba lo simétrico: un
 * complejo `canceled` no puede ocupar una cancha DESPUÉS de su corte, por
 * ninguno de los caminos que insertan en `bookings`. Cuando el período vence,
 * el sweep lo deja `blocked` y todo turno del otro lado queda huérfano — el
 * cliente lo tiene reservado (a veces con la seña ya cobrada) y el complejo no
 * puede ni verlo.
 *
 * Ojo con el reloj: las fechas se arman con `addDays(artTodayStr(), n)`, las
 * MISMAS funciones que usa el código bajo test. Con `toISOString()` esto sería
 * flaky entre las 21:00 y la medianoche ART (ver la nota equivalente en
 * `booking-reschedule.test.ts`).
 */

const PRICING = {
  rules: [
    {
      days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
      from: '08:00',
      to: '23:00',
      price: 500000,
    },
  ],
}

/** Período pago que termina dentro de 10 días → corte = hoy + 10. */
const PERIOD_DAYS = 10
const CUTOFF = () => addDays(artTodayStr(), PERIOD_DAYS)
const INSIDE = () => addDays(artTodayStr(), PERIOD_DAYS - 1)
const OUTSIDE = () => addDays(artTodayStr(), PERIOD_DAYS + 1)

function dayOfWeekOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay()
}

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${`Cancha ${Math.random().toString(36).slice(2, 8)}`}, ${10},
      ${sql.json(PRICING as never)}, 'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

type Fixture = { tenantId: string; staffUserId: string; playerId: string; courtId: string }

/** Complejo con suscripción cuyo período termina en `PERIOD_DAYS` días. */
async function seedTenant(
  tenantStatus: 'canceled' | 'active',
  periodDays: number = PERIOD_DAYS,
): Promise<Fixture> {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const planId = await getOrCreatePlanId(sql)
  const staff = await createTestStaffUser(sql)
  const player = await createTestPlayer(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id, 'admin')
  await linkPlayerToTenant(sql, tenant.id, player.id)

  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, status,
      current_period_start, current_period_end
    ) VALUES (
      ${tenant.id}, ${planId}, 'monthly'::billing_cycle,
      ${sql.unsafe(`'${tenantStatus}'::subscription_status`)},
      NOW() - INTERVAL '5 days',
      ${sql.unsafe(`NOW() + INTERVAL '${periodDays} days'`)}
    )
  `
  await sql`
    UPDATE tenants SET status = ${sql.unsafe(`'${tenantStatus}'::tenant_status`)}
    WHERE id = ${tenant.id}
  `
  return {
    tenantId: tenant.id,
    staffUserId: staff.id,
    playerId: player.id,
    courtId: await insertCourt(tenant.id),
  }
}

beforeAll(async () => {
  await ensureRoles()
  await cleanupAll()
}, 30_000)

afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('tope de fecha del período pago (complejo canceled)', () => {
  it('carga manual: adentro del período entra, afuera se rechaza con la fecha de corte', async () => {
    const f = await seedTenant('canceled')

    const ok = await withTenantContext(f.tenantId, (tx) =>
      createManualBooking(
        f.tenantId,
        {
          courtId: f.courtId,
          date: INSIDE(),
          timeStart: '10:00',
          timeEnd: '11:00',
          type: 'spontaneous',
          staffUserId: f.staffUserId,
          guestName: 'Cliente',
        },
        tx,
      ),
    )
    expect(ok.id).toBeTruthy()

    // La carga manual NUNCA tuvo ventana de anticipación: este es el único tope
    // que se le pone, y sin él la fecha de abajo entraba sin chistar.
    const err = await withTenantContext(f.tenantId, (tx) =>
      createManualBooking(
        f.tenantId,
        {
          courtId: f.courtId,
          date: OUTSIDE(),
          timeStart: '10:00',
          timeEnd: '11:00',
          type: 'spontaneous',
          staffUserId: f.staffUserId,
          guestName: 'Cliente',
        },
        tx,
      ),
    ).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(BookingDateOutOfRangeError)
    expect((err as BookingDateOutOfRangeError).reason).toBe('after_period_end')
    // El `cutoff` viaja en el error porque el mensaje útil para el admin es la
    // fecha, y la action no la tiene sin repetir la query del guard.
    expect((err as BookingDateOutOfRangeError).cutoff).toBe(CUTOFF())
  }, 30_000)

  it('control negativo: el mismo complejo ACTIVE carga esa fecha sin problema', async () => {
    const f = await seedTenant('active')

    const ok = await withTenantContext(f.tenantId, (tx) =>
      createManualBooking(
        f.tenantId,
        {
          courtId: f.courtId,
          date: OUTSIDE(),
          timeStart: '10:00',
          timeEnd: '11:00',
          type: 'spontaneous',
          staffUserId: f.staffUserId,
          guestName: 'Cliente',
        },
        tx,
      ),
    )
    expect(ok.id).toBeTruthy()
  }, 30_000)

  it('reserva online: el guard es el backstop del recorte que hace el portal', async () => {
    const f = await seedTenant('canceled')

    const err = await withTenantContext(f.tenantId, (tx) =>
      createOnlineBooking(
        f.tenantId,
        {
          playerId: f.playerId,
          courtId: f.courtId,
          date: OUTSIDE(),
          timeStart: '10:00',
          timeEnd: '11:00',
          requiresDeposit: false,
          depositPercentage: 0,
          // A propósito SIN `maxAdvanceDays`: así lo que frena es el guard y no
          // la ventana de anticipación, que es la otra mitad del fix.
        },
        tx,
      ),
    ).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(BookingDateOutOfRangeError)
    expect((err as BookingDateOutOfRangeError).reason).toBe('after_period_end')
  }, 30_000)

  it('mover un turno: no se puede cruzar el corte', async () => {
    // Corte a 2 días, no a 10: `assertDateWindow` ya frena todo lo que pase la
    // anticipación configurada (6 días por default), así que el tope del
    // período sólo tiene algo que decir cuando el corte cae ANTES que esa
    // ventana. Con un corte a 10 días este caso salía por `advance_exceeded` y
    // el guard no se ejercitaba nunca.
    const f = await seedTenant('canceled', 2)
    const pastCutoff = addDays(artTodayStr(), 5)

    const booking = await withTenantContext(f.tenantId, (tx) =>
      createManualBooking(
        f.tenantId,
        {
          courtId: f.courtId,
          date: addDays(artTodayStr(), 1),
          timeStart: '10:00',
          timeEnd: '11:00',
          type: 'spontaneous',
          staffUserId: f.staffUserId,
          playerId: f.playerId,
        },
        tx,
      ),
    )

    const err = await withTenantContext(f.tenantId, (tx) =>
      rescheduleBooking(
        f.tenantId,
        {
          bookingId: booking.id,
          courtId: f.courtId,
          date: pastCutoff,
          timeStart: '10:00',
          timeEnd: '11:00',
          staffUserId: f.staffUserId,
        },
        tx,
      ),
    ).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(BookingDateOutOfRangeError)
    expect((err as BookingDateOutOfRangeError).reason).toBe('after_period_end')
  }, 30_000)

  it('turno fijo: RECORTA en el corte en vez de rechazar, y el recorte se ve en slotsGenerated', async () => {
    const f = await seedTenant('canceled')
    // Arranca en +3: las ocurrencias semanales caen en +3 y +10 (el corte, que
    // entra) y +17 en adelante (que no). El `count` interno es 8.
    const startsOn = addDays(artTodayStr(), 3)

    const created = await withTenantContext(f.tenantId, (tx) =>
      createAbonado(
        f.tenantId,
        f.staffUserId,
        {
          courtId: f.courtId,
          contactName: 'Grupo del martes',
          contactPhone: '+54 9 11 5555-5555',
          dayOfWeek: dayOfWeekOf(startsOn),
          timeStart: '20:00',
          timeEnd: '21:00',
          pricePerSession: 500000,
          startsOn,
        },
        tx,
      ),
    )

    // Sin el recorte serían 8 sesiones, 6 de ellas después del cierre.
    expect(created.slotsGenerated).toBe(2)
  }, 30_000)

  it('horas de torneo: RECHAZA el lote entero y no toma ninguna hora', async () => {
    const sql = getSql()
    const f = await seedTenant('canceled')
    const tournamentId = await insertTournament(sql, f.tenantId)

    const err = await withTenantContext(f.tenantId, (tx) =>
      reserveTournamentSlots(
        f.tenantId,
        tournamentId,
        f.staffUserId,
        {
          courtIds: [f.courtId],
          // La primera entra, la segunda no: el lote cae completo porque el
          // admin eligió estas fechas a mano (a diferencia del abonado).
          dates: [INSIDE(), OUTSIDE()],
          timeStart: '19:00',
          timeEnd: '21:00',
        },
        tx,
      ),
    ).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(BookingDateOutOfRangeError)
    expect((err as BookingDateOutOfRangeError).reason).toBe('after_period_end')

    const [{ n }] = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM bookings WHERE tournament_id = ${tournamentId}
    `
    expect(n).toBe(0)
  }, 30_000)
})
