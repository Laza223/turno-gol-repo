import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Sql } from 'postgres'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { getCashFlowsForExport, getRevenueReport } from '@/modules/reports/report.service'
import { nightCutoffMins } from '@/shared/time/operating-day'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

/**
 * Los reportes eran la última superficie de plata en UTC calendario puro: el
 * resto del sistema migró a día operativo el 2026-07-24 y
 * `docs/decisions/2026-07-24-caja-cantina-dia-operativo.md` lo dejó anotado
 * explícitamente como fuera de alcance. Este archivo cierra ese hilo.
 *
 * Calcado de `cashflow-operating-day.test.ts` / `metrics-operating-day.test.ts`.
 */

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => closeSql())

/** Cierra 02:00 todos los días → cutoff de 120 min, sin ambigüedad semanal. */
const NIGHT_HOURS: OpeningHours = {
  mon: { open: '20:00', close: '02:00' },
  tue: { open: '20:00', close: '02:00' },
  wed: { open: '20:00', close: '02:00' },
  thu: { open: '20:00', close: '02:00' },
  fri: { open: '20:00', close: '02:00' },
  sat: { open: '20:00', close: '02:00' },
  sun: { open: '20:00', close: '02:00' },
}

/** Complejo normal: cierra a medianoche, cutoff 0. */
const DAY_HOURS: OpeningHours = {
  mon: { open: '08:00', close: '00:00' },
  tue: { open: '08:00', close: '00:00' },
  wed: { open: '08:00', close: '00:00' },
  thu: { open: '08:00', close: '00:00' },
  fri: { open: '08:00', close: '00:00' },
  sat: { open: '08:00', close: '00:00' },
  sun: { open: '08:00', close: '00:00' },
}

async function seedTenant(sql: Sql, hours: OpeningHours, closesNextDay: boolean) {
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  await sql`
    UPDATE tenants SET closes_next_day = ${closesNextDay}, opening_hours = ${sql.json(hours)}
    WHERE id = ${tenant.id}
  `
  await sql`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenant.id}, ${'Cancha 1'}, ${10}, ${sql.json({
      rules: [
        {
          days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          from: '08:00',
          to: '23:00',
          price: 800000,
        },
      ],
    })}, 'online')
  `
  return { tenant, staff }
}

async function insertIncome(
  sql: Sql,
  tenantId: string,
  staffId: string,
  occurredAtIso: string,
  amount: number,
): Promise<void> {
  await sql`
    INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
    VALUES (${tenantId}, 'income', 'booking', ${amount}, 'cash', ${'Turno'}, ${staffId}, ${occurredAtIso})
  `
}

describe('reportes — el mes arranca en día operativo, no a medianoche UTC', () => {
  it('un cobro de las 22:00 ART del último día del mes NO se va al mes siguiente', async () => {
    const sql = getSql()
    const { tenant, staff } = await seedTenant(sql, DAY_HOURS, false)

    // 2026-05-31 22:00 ART = 2026-06-01 01:00 UTC. Con el cálculo viejo
    // (medianoche UTC) este cobro caía en JUNIO, mientras /caja lo mostraba en
    // mayo: el mismo peso contado en dos meses distintos.
    await insertIncome(sql, tenant.id, staff.id, '2026-06-01T01:00:00Z', 500000)

    const mayo = await getRevenueReport(tenant.id, '2026-05', DAY_HOURS, null, false)
    const junio = await getRevenueReport(tenant.id, '2026-06', DAY_HOURS, null, false)

    expect(mayo.income).toBe(500000)
    expect(junio.income).toBe(0)
  })

  it('un cobro de las 23:00 ART del día 1 pertenece a ese mes, no al anterior', async () => {
    const sql = getSql()
    const { tenant, staff } = await seedTenant(sql, DAY_HOURS, false)

    // 2026-05-01 23:00 ART = 2026-05-02 02:00 UTC — sanity check del borde de arranque.
    await insertIncome(sql, tenant.id, staff.id, '2026-05-02T02:00:00Z', 300000)

    const abril = await getRevenueReport(tenant.id, '2026-04', DAY_HOURS, null, false)
    const mayo = await getRevenueReport(tenant.id, '2026-05', DAY_HOURS, null, false)

    expect(abril.income).toBe(0)
    expect(mayo.income).toBe(300000)
  })

  it('con closes_next_day, la madrugada del día 1 factura en el mes ANTERIOR', async () => {
    const sql = getSql()
    const { tenant, staff } = await seedTenant(sql, NIGHT_HOURS, true)
    expect(nightCutoffMins(NIGHT_HOURS, true)).toBe(120)

    // 2026-06-01 01:00 ART = 2026-06-01 04:00 UTC. El complejo cierra a las
    // 02:00, así que esa venta es de la noche del 31 de mayo → mes de mayo.
    await insertIncome(sql, tenant.id, staff.id, '2026-06-01T04:00:00Z', 700000)

    const mayo = await getRevenueReport(tenant.id, '2026-05', NIGHT_HOURS, null, true)
    const junio = await getRevenueReport(tenant.id, '2026-06', NIGHT_HOURS, null, true)

    expect(mayo.income).toBe(700000)
    expect(junio.income).toBe(0)
  })
})

describe('reportes — ocupación y CSV', () => {
  it('un complejo que cierra 02:00 tiene minutos disponibles > 0 (no reporta 0% siempre)', async () => {
    const sql = getSql()
    const { tenant, staff } = await seedTenant(sql, NIGHT_HOURS, true)

    const [seededCourt] = await sql<{ id: string }[]>`
      SELECT id FROM courts WHERE tenant_id = ${tenant.id} LIMIT 1
    `

    // Turno dentro del horario nocturno, en día operativo 2026-05-04.
    // starts_at/ends_at son NOT NULL desde la migr. 041 y no tienen default:
    // 21:00 ART del 4 = 2026-05-05T00:00:00Z (ART = UTC-3).
    const [booking] = await sql<{ id: string }[]>`
      INSERT INTO bookings (
        tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
        status, type, price_snapshot, guest_name
      ) VALUES (
        ${tenant.id}, ${seededCourt!.id}, ${'2026-05-04'}, ${'21:00'}, ${'22:00'},
        ${'2026-05-05T00:00:00Z'}, ${'2026-05-05T01:00:00Z'},
        'completed', 'spontaneous', ${800000}, ${'Test'}
      ) RETURNING id
    `

    // El cobro va ATADO al booking: `byCourt` sale de los cash_flows con
    // booking_id + category='booking' (Q2a de fetchPeriodAgg). Un income suelto
    // no aparecería en byCourt y el test mediría otra cosa.
    await sql`
      INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at, booking_id)
      VALUES (${tenant.id}, 'income', 'booking', ${800000}, 'cash', ${'Turno'}, ${staff.id}, ${'2026-05-05T01:00:00Z'}, ${booking!.id})
    `

    const report = await getRevenueReport(tenant.id, '2026-05', NIGHT_HOURS, null, true)
    const court = report.byCourt[0]

    // Antes `calcAvailableMinutes` daba Math.max(0, 120 - 1200) = 0 para este
    // horario, el denominador quedaba en cero y la ocupación salía 0% con el
    // complejo lleno.
    expect(court).toBeDefined()
    expect(court!.occupancyPct).toBeGreaterThan(0)

    // Valor exacto, derivado: mayo tiene 31 días × (02:00+24h − 20:00) = 360
    // min/día = 11160 min disponibles en 1 cancha; 60 min reservados → 0,5%.
    // Se asserta el número y no solo "> 0" para que un cambio en el denominador
    // se lea acá y no se disuelva en un umbral laxo.
    expect(court!.occupancyPct).toBe(0.5)
    expect(court!.income).toBe(800000)
  })

  it('la columna `fecha` del CSV usa el día operativo, no el UTC crudo', async () => {
    const sql = getSql()
    const { tenant, staff } = await seedTenant(sql, DAY_HOURS, false)

    // 22:00 ART del 5 = 01:00 UTC del 6. El CSV decía "2026-05-06".
    await insertIncome(sql, tenant.id, staff.id, '2026-05-06T01:00:00Z', 250000)

    const rows = await withTenantContext(tenant.id, (tx) =>
      getCashFlowsForExport(
        tenant.id,
        new Date('2026-05-01T03:00:00Z'),
        new Date('2026-06-01T03:00:00Z'),
        0,
        tx,
      ),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].fecha).toBe('2026-05-05')
  })
})
