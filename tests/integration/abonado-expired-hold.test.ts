/**
 * AUD-02 de la auditoría integral del 2026-09-06
 * (`docs/audits/2026-09-06-auditoria-integral-fase-diagnostico.md`).
 *
 * Un hold online que venció (`expired`) bloqueaba la sesión de un turno fijo en
 * esa fecha, en silencio. La cadena:
 *
 *   1. un jugador arranca una reserva online sobre el martes 20:00 y la
 *      abandona; a los 6 minutos la fila queda en `expired`;
 *   2. el complejo da de alta —o reactiva— un abono para los martes 20:00;
 *   3. el predicado de conflictos de abonados excluye sólo los cancelados, así
 *      que cuenta la fila `expired` como ocupada y saltea esa fecha;
 *   4. el cliente fijo se queda sin su sesión de esa semana, y como el
 *      constraint de solapamiento sólo mira `pending_payment|confirmed`, el
 *      slot se vuelve a ofrecer online.
 *
 * `completed` y `no_show` siguen contando como ocupado a propósito: sólo
 * existen en el pasado, así que no afectan la generación de sesiones futuras.
 * `expired` era el único estado futuro que entraba.
 *
 * El primer caso estuvo ROJO antes del arreglo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createAbonado } from '@/modules/abonados/abonado.service'
import { runRollingSlotGeneration } from '@/shared/jobs/workers/generate-abonado-slots.worker'
import { artTodayStr } from '@/shared/dates/art'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 800000,
    },
  ],
}

/** Un martes lejano: la generación de sesiones arranca ahí. */
const MARTES = '2030-01-08'
const MARTES_SIGUIENTE = '2030-01-15'
const DIA_MARTES = 2

let tenantId: string
let courtId: string
let courtId2: string
let staffId: string
let playerId: string

async function insertCourt(nombre: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${nombre}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function insertBooking(cancha: string, date: string, status: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at, type, status, price_snapshot, deposit_amount, deposit_status
    )
    VALUES (
      ${tenantId}, ${cancha}, ${playerId}, ${date}::date,
      '20:00'::time, '21:00'::time,
      ${`${date}T20:00:00-03:00`}::timestamptz,
      ${`${date}T21:00:00-03:00`}::timestamptz,
      'spontaneous', ${status}::booking_status, ${800000}, 0, 'not_required'
    )
    RETURNING id
  `
  return rows[0]!.id
}

function inputAbonado(cancha: string, startsOn: string) {
  return {
    courtId: cancha,
    contactName: 'Cliente fijo',
    contactPhone: '1155667788',
    dayOfWeek: DIA_MARTES,
    timeStart: '20:00',
    timeEnd: '21:00',
    pricePerSession: 800000,
    startsOn,
  }
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)

  const tenant = await createTestTenant(sql)
  tenantId = tenant.id
  courtId = await insertCourt('Cancha AUD-02')
  courtId2 = await insertCourt('Cancha AUD-02 bis')

  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenantId, staff.id)
  staffId = staff.id

  const player = await createTestPlayer(sql)
  playerId = player.id
}, 60_000)

afterAll(async () => {
  await cleanupAll(getSql())
  await closeSql()
}, 60_000)

describe('un hold vencido no le come la sesión al turno fijo', () => {
  it('el abono genera la sesión del martes aunque haya un hold expired esa fecha', async () => {
    await insertBooking(courtId, MARTES, 'expired')

    const creado = await withTenantContext(tenantId, (tx) =>
      createAbonado(tenantId, staffId, inputAbonado(courtId, MARTES), tx),
    )

    expect(creado.conflictDates).toEqual([])
    expect(creado.slotsGenerated).toBeGreaterThan(0)

    const sql = getSql()
    const generadas = await sql<Array<{ id: string }>>`
      SELECT id FROM bookings
      WHERE abonado_id = ${creado.abonado.id} AND date = ${MARTES}::date
    `
    expect(generadas).toHaveLength(1)
  })

  it('una reserva confirmada SÍ le sigue ganando al fijo', async () => {
    // Contraparte: sin esto, un predicado que ignore todo también pasaría.
    // Cancha aparte para no chocar con las sesiones que generó el caso anterior.
    await insertBooking(courtId2, MARTES_SIGUIENTE, 'confirmed')

    const creado = await withTenantContext(tenantId, (tx) =>
      createAbonado(tenantId, staffId, inputAbonado(courtId2, MARTES_SIGUIENTE), tx),
    )

    expect(creado.conflictDates).toContain(MARTES_SIGUIENTE)
  })
})

/**
 * El alta cubre `findAbonadoBookingOverlaps`; el barrido que genera las sesiones
 * de las semanas siguientes usa la OTRA función (`getAbonadoSlotConflicts`), que
 * arrastraba el mismo predicado ancho. Sin estos dos casos, la mitad del arreglo
 * quedaba sin test justo en el camino que importa a partir de la segunda semana,
 * cuando el alta ya no interviene.
 *
 * Fechas RELATIVAS a hoy en ART: el barrido arranca en su propio "hoy", así que
 * una fecha fija dejaría de ejercitarlo el día que quede en el pasado.
 */
function proximaFecha(diasAdelante: number): { fecha: string; dow: number } {
  const ms = Date.parse(`${artTodayStr()}T12:00:00Z`) + diasAdelante * 86_400_000
  const d = new Date(ms)
  return { fecha: d.toISOString().slice(0, 10), dow: d.getUTCDay() }
}

async function insertAbonadoActivo(cancha: string, dow: number): Promise<string> {
  const sql = getSql()
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO abonados (
      tenant_id, court_id, contact_name, contact_phone,
      day_of_week, time_start, time_end, price_per_session, starts_on, status
    )
    VALUES (
      ${tenantId}, ${cancha}, 'Fijo del barrido', '1199887766',
      ${dow}, '20:00'::time, '21:00'::time, ${800000}, ${artTodayStr()}::date, 'active'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function fechasGeneradas(abonadoId: string): Promise<string[]> {
  const sql = getSql()
  const rows = await sql<Array<{ date: string }>>`
    SELECT date::text AS date FROM bookings WHERE abonado_id = ${abonadoId} ORDER BY date
  `
  return rows.map((r) => r.date)
}

describe('el barrido que genera las sesiones siguientes usa el mismo criterio', () => {
  it('genera la sesión aunque haya un hold expired en esa fecha', async () => {
    const { fecha, dow } = proximaFecha(3)
    const cancha = await insertCourt('Cancha barrido expired')
    await insertBooking(cancha, fecha, 'expired')
    const abonadoId = await insertAbonadoActivo(cancha, dow)

    await runRollingSlotGeneration()

    expect(await fechasGeneradas(abonadoId)).toContain(fecha)
  })

  it('NO genera la sesión si esa fecha ya tiene una reserva confirmada', async () => {
    const { fecha, dow } = proximaFecha(4)
    const cancha = await insertCourt('Cancha barrido confirmada')
    await insertBooking(cancha, fecha, 'confirmed')
    const abonadoId = await insertAbonadoActivo(cancha, dow)

    await runRollingSlotGeneration()

    expect(await fechasGeneradas(abonadoId)).not.toContain(fecha)
  })
})
