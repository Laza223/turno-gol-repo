import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { createAbonado } from '@/modules/abonados/abonado.service'
import { runRollingSlotGeneration } from '@/shared/jobs/workers/generate-abonado-slots.worker'
import { addDays, artTodayStr } from '@/shared/dates/art'
import { getOrCreatePlanId } from '../helpers/factories'

// Gap de recon (D4): el cron de slots (generate-abonado-slots.worker) corrido
// dos veces seguidas no debe duplicar bookings. Mismo seed que
// abonados.test.ts:236-274 ("rolling job: abonado with 3 future weeks →
// genera 4 más"), extendido con una SEGUNDA corrida para probar la
// idempotencia del re-run.
//
// 2030-01-07 es lunes (dayOfWeek=1), lejos en el futuro a propósito — mismo
// criterio que abonados.test.ts, evita que el test dependa de en qué día de
// la semana real se corra.
const ABO_START = '2030-01-07'
const ABO_DOW = 1 // lunes

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha Rerun Test'}, ${10},
      ${sql.json({ rules: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '08:00', to: '23:00', price: 800000 }] })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function countFutureBookings(abonadoId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM bookings
    WHERE abonado_id = ${abonadoId} AND date >= NOW()::date
  `
  return rows[0]!.n
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('generate-abonado-slots.worker — el cron corrido 2 veces seguidas no duplica', () => {
  it('con 3 semanas futuras: 1ra corrida genera 4 más, la 2da es no-op EXACTO (mismo count, cero court+starts_at repetidos, no lanza)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const { abonado } = await withTenantContext(tenant.id, (tx) =>
      createAbonado(
        tenant.id,
        staff.id,
        {
          courtId,
          contactName: 'Rerun Idempotency Test',
          contactPhone: '0000000099',
          dayOfWeek: ABO_DOW,
          timeStart: '11:00',
          timeEnd: '12:00',
          pricePerSession: 800000,
          startsOn: ABO_START,
        },
        tx,
      ),
    )
    expect(await countFutureBookings(abonado.id)).toBe(8)

    // Deja 3 de las 8 semanas futuras (mismo recorte que abonados.test.ts) —
    // por debajo del umbral (`futureCnt >= 4`) que hace que el worker genere.
    await sql`
      DELETE FROM bookings
      WHERE abonado_id = ${abonado.id}
        AND date >= NOW()::date
        AND id IN (
          SELECT id FROM bookings
          WHERE abonado_id = ${abonado.id} AND date >= NOW()::date
          ORDER BY date DESC
          LIMIT 5
        )
    `
    expect(await countFutureBookings(abonado.id)).toBe(3)

    // 1ra corrida: genera 4 slots nuevos (3 + 4 = 7).
    await expect(runRollingSlotGeneration()).resolves.toBeUndefined()
    const countAfterFirst = await countFutureBookings(abonado.id)
    expect(countAfterFirst).toBe(7)

    // 2da corrida SEGUIDA, sin tocar nada en el medio: no debe lanzar NI
    // agregar una fila más. En este escenario puntual el guard
    // `futureCnt >= 4` corta la corrida antes de intentar ningún INSERT —
    // la exclusion constraint `no_overlapping_bookings` + ON CONFLICT DO
    // NOTHING (migr. 041) es el respaldo más profundo para un re-disparo
    // GENUINAMENTE concurrente (dos corridas superpuestas en el tiempo, no
    // cubierto acá — ver los tests de "carrera" con Promise.all).
    await expect(runRollingSlotGeneration()).resolves.toBeUndefined()
    const countAfterSecond = await countFutureBookings(abonado.id)
    expect(countAfterSecond).toBe(countAfterFirst)

    // Cero duplicados de verdad: ningún (court_id, starts_at) repetido.
    const dupes = await sql<{ court_id: string; starts_at: Date; n: number }[]>`
      SELECT court_id, starts_at, COUNT(*)::int AS n
      FROM bookings
      WHERE abonado_id = ${abonado.id}
      GROUP BY court_id, starts_at
      HAVING COUNT(*) > 1
    `
    expect(dupes).toHaveLength(0)

    // Y de paso, ninguna fila de bookings del abonado repite starts_at aunque
    // sea con OTRO court_id (defensivo: acá solo hay una cancha, pero deja
    // explícito qué universo cubre la unicidad esperada).
    const rows = await sql<{ starts_at: Date }[]>`
      SELECT starts_at FROM bookings WHERE abonado_id = ${abonado.id}
    `
    const uniqueStartsAt = new Set(rows.map((r) => new Date(r.starts_at).getTime()))
    expect(uniqueStartsAt.size).toBe(rows.length)
  })

  it('complejo dado de baja: el worker LE SIGUE generando turnos fijos, pero no más allá del período pago', async () => {
    // Dos bugs en un caso. Antes del 2026-08-20 `canceled` estaba en
    // SKIP_STATUSES, así que al complejo que se daba de baja con dos meses
    // pagos por delante se le cortaba la generación de turnos fijos desde el
    // día uno: sus clientes con horario fijo se quedaban sin sesiones aunque
    // el complejo siguiera abierto y pago. Y al sacarlo del skip aparece el
    // otro: sin tope generaría turnos DESPUÉS del corte, que es cuando el
    // sweep lo deja `blocked` y no puede ni verlos.
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    // El abonado nace con el complejo ACTIVO a propósito: si ya estuviera dado
    // de baja, `createAbonado` recortaría en origen y no estaríamos midiendo
    // el worker sino el otro camino (ver `paid-period-guard.test.ts`).
    const startsOn = addDays(artTodayStr(), 7)
    const dayOfWeek = new Date(`${startsOn}T12:00:00Z`).getUTCDay()
    const { abonado } = await withTenantContext(tenant.id, (tx) =>
      createAbonado(
        tenant.id,
        staff.id,
        {
          courtId,
          contactName: 'Turno fijo de complejo dado de baja',
          contactPhone: '0000000098',
          dayOfWeek,
          timeStart: '15:00',
          timeEnd: '16:00',
          pricePerSession: 800000,
          startsOn,
        },
        tx,
      ),
    )
    expect(await countFutureBookings(abonado.id)).toBe(8)

    // Deja 3 semanas futuras (+7, +14, +21) para bajar del umbral `>= 4` y que
    // el worker tenga algo que hacer.
    await sql`
      DELETE FROM bookings
      WHERE abonado_id = ${abonado.id}
        AND date >= NOW()::date
        AND id IN (
          SELECT id FROM bookings
          WHERE abonado_id = ${abonado.id} AND date >= NOW()::date
          ORDER BY date DESC
          LIMIT 5
        )
    `
    expect(await countFutureBookings(abonado.id)).toBe(3)

    // Recién ahora el complejo se da de baja, con 30 días de período por delante.
    const planId = await getOrCreatePlanId(sql)
    await sql`
      INSERT INTO tenant_subscriptions (
        tenant_id, plan_id, billing_cycle, status,
        current_period_start, current_period_end
      ) VALUES (
        ${tenant.id}, ${planId}, 'monthly'::billing_cycle, 'canceled'::subscription_status,
        NOW() - INTERVAL '5 days', NOW() + INTERVAL '30 days'
      )
    `
    await sql`UPDATE tenants SET status = 'canceled'::tenant_status WHERE id = ${tenant.id}`

    await expect(runRollingSlotGeneration()).resolves.toBeUndefined()

    // El worker ancla en la última futura (+21) y quiere generar 4: +28, +35,
    // +42 y +49. Con el corte en +30 sólo entra +28 → 3 + 1 = 4.
    // Con `canceled` todavía en SKIP_STATUSES esto daba 3 (no generaba nada);
    // sin el recorte daría 7.
    expect(await countFutureBookings(abonado.id)).toBe(4)

    const cutoff = addDays(artTodayStr(), 30)
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM bookings
      WHERE abonado_id = ${abonado.id} AND date > ${cutoff}::date
    `
    expect(n).toBe(0)
  }, 30_000)
})
