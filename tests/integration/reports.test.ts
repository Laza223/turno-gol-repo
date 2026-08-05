import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { getRevenueReport, getCashFlowsForExport } from '@/modules/reports/report.service'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

const OPENING_HOURS: OpeningHours = {
  mon: { open: '08:00', close: '00:00' },
  tue: { open: '08:00', close: '00:00' },
  wed: { open: '08:00', close: '00:00' },
  thu: { open: '08:00', close: '00:00' },
  fri: { open: '08:00', close: '00:00' },
  sat: { open: '08:00', close: '00:00' },
  sun: { open: '08:00', close: '00:00' },
}

const MAY_FROM = new Date('2026-05-01T00:00:00.000Z')
const MAY_TO = new Date('2026-06-01T00:00:00.000Z')
const APR_FROM = new Date('2026-04-01T00:00:00.000Z')
const APR_TO = new Date('2026-05-01T00:00:00.000Z')

let tenantId: string
let staffId: string

beforeAll(async () => {
  await ensureRoles()
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  tenantId = tenant.id
  const staff = await createTestStaffUser(sql)
  staffId = staff.id
  await linkStaffToTenant(sql, tenantId, staffId)

  // Insert an online court
  await sql`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId},
      ${'Cancha Reporte Test'},
      ${10},
      ${sql.json({
        rules: [{
          days: ['mon','tue','wed','thu','fri','sat','sun'],
          from: '08:00', to: '23:00',
          price: 800000,
        }],
      })},
      'online'
    )
  `
})

afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('getRevenueReport — empty period', () => {
  it('returns all zeros with null prevPeriod when no data', async () => {
    const report = await getRevenueReport(tenantId, MAY_FROM, MAY_TO, OPENING_HOURS, APR_FROM, APR_TO)
    expect(report.income).toBe(0)
    expect(report.adjustment).toBe(0)
    expect(report.balance).toBe(0)
    expect(report.bookingCount).toBe(0)
    expect(report.byCourt).toEqual([])
    expect(report.byMethod).toEqual([])
    expect(report.prevPeriod).toBeNull()
  })
})

describe('getRevenueReport — with data', () => {
  beforeAll(async () => {
    const sql = getSql()
    await sql`
      INSERT INTO cash_flows
        (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
      VALUES
        (${tenantId}, 'income',     'other', ${60000}, 'cash',     ${'Efectivo Mayo'},    ${staffId}, ${'2026-05-10T10:00:00Z'}),
        (${tenantId}, 'income',     'other', ${40000}, 'transfer', ${'Transfer Mayo'},     ${staffId}, ${'2026-05-15T12:00:00Z'}),
        (${tenantId}, 'adjustment', 'other', ${5000},  'cash',     ${'Ajuste Mayo'},       ${staffId}, ${'2026-05-20T09:00:00Z'}),
        (${tenantId}, 'income',     'other', ${20000}, 'cash',     ${'Efectivo Abril'},    ${staffId}, ${'2026-04-15T10:00:00Z'})
    `
  })

  it('sums income and adjustment correctly', async () => {
    const report = await getRevenueReport(tenantId, MAY_FROM, MAY_TO, OPENING_HOURS, APR_FROM, APR_TO)
    expect(report.income).toBe(100000)
    expect(report.adjustment).toBe(5000)
    expect(report.balance).toBe(105000)
  })

  it('groups by payment method', async () => {
    const report = await getRevenueReport(tenantId, MAY_FROM, MAY_TO, OPENING_HOURS, APR_FROM, APR_TO)
    const cash = report.byMethod.find((m) => m.method === 'cash')
    const transfer = report.byMethod.find((m) => m.method === 'transfer')
    expect(cash?.total).toBe(60000)   // solo income: adjustment no entra en byMethod (#43)
    expect(transfer?.total).toBe(40000)
  })

  it('returns prevPeriod when April has data', async () => {
    const report = await getRevenueReport(tenantId, MAY_FROM, MAY_TO, OPENING_HOURS, APR_FROM, APR_TO)
    expect(report.prevPeriod).not.toBeNull()
    expect(report.prevPeriod?.income).toBe(20000)
    expect(report.prevPeriod?.balance).toBe(20000)
  })

  it('returns null prevPeriod when prev period is empty', async () => {
    const JAN_FROM = new Date('2026-01-01T00:00:00.000Z')
    const JAN_TO = new Date('2026-02-01T00:00:00.000Z')
    const DEC_FROM = new Date('2025-12-01T00:00:00.000Z')
    const DEC_TO = new Date('2026-01-01T00:00:00.000Z')
    const report = await getRevenueReport(tenantId, JAN_FROM, JAN_TO, OPENING_HOURS, DEC_FROM, DEC_TO)
    expect(report.prevPeriod).toBeNull()
  })
})

describe('getCashFlowsForExport', () => {
  it('returns rows with correct shape', async () => {
    const rows = await getCashFlowsForExport(tenantId, MAY_FROM, MAY_TO)
    expect(rows.length).toBeGreaterThan(0)
    const row = rows[0]
    expect(typeof row.fecha).toBe('string')
    expect(row.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof row.monto_ars).toBe('number')
    expect(row).toHaveProperty('tipo')
    expect(row).toHaveProperty('categoria')
    expect(row).toHaveProperty('metodo')
    expect(row).toHaveProperty('descripcion')
    expect(row).toHaveProperty('cancha')
  })

  it('returns empty array for period with no data', async () => {
    const rows = await getCashFlowsForExport(
      tenantId,
      new Date('2027-01-01T00:00:00.000Z'),
      new Date('2027-02-01T00:00:00.000Z'),
    )
    expect(rows).toEqual([])
  })
})

/**
 * Q2a de getRevenueReport ("ingreso por cancha") sale de los cash_flows que
 * tienen booking_id. Desde Fase 3 una venta de cantina puede llevar booking_id
 * (consumo cargado al turno), así que sin el filtro por categoría la cerveza se
 * contaría como facturación de la cancha.
 */
describe('getRevenueReport — byCourt no mezcla cantina con el turno', () => {
  const JUN_FROM = new Date('2026-06-01T00:00:00.000Z')
  const JUN_TO = new Date('2026-07-01T00:00:00.000Z')
  let courtId: string
  let bookingId: string

  beforeAll(async () => {
    const sql = getSql()
    const courtRows = await sql<{ id: string }[]>`
      SELECT id FROM courts WHERE tenant_id = ${tenantId} LIMIT 1
    `
    courtId = courtRows[0]!.id

    const bookingRows = await sql<{ id: string }[]>`
      INSERT INTO bookings (
        tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
        price_snapshot, deposit_amount, deposit_status, status, guest_name
      ) VALUES (
        ${tenantId}, ${courtId}, '2026-06-10'::date, '18:00'::time, '19:00'::time,
        '2026-06-10T21:00:00Z', '2026-06-10T22:00:00Z',
        ${500000}, 0, 'not_required', 'completed', 'Invitado Reporte'
      ) RETURNING id
    `
    bookingId = bookingRows[0]!.id

    await sql`
      INSERT INTO cash_flows
        (tenant_id, type, category, amount, method, description, registered_by, occurred_at, booking_id)
      VALUES
        (${tenantId}, 'income', 'booking',      ${500000}, 'cash', ${'Turno'},   ${staffId}, ${'2026-06-10T21:30:00Z'}, ${bookingId}),
        (${tenantId}, 'income', 'product_sale', ${90000},  'cash', ${'Cantina: Cerveza x3'}, ${staffId}, ${'2026-06-10T21:40:00Z'}, ${bookingId})
    `
  })

  it('la cancha factura sólo el turno; la cantina queda fuera de byCourt', async () => {
    const report = await getRevenueReport(tenantId, JUN_FROM, JUN_TO, OPENING_HOURS, MAY_FROM, MAY_TO)
    const court = report.byCourt.find((c) => c.courtId === courtId)
    expect(court).toBeDefined()
    expect(court!.income).toBe(500000)
    expect(court!.bookingCount).toBe(1)
  })

  it('pero la plata de cantina SÍ entra al total del período (no se pierde)', async () => {
    const report = await getRevenueReport(tenantId, JUN_FROM, JUN_TO, OPENING_HOURS, MAY_FROM, MAY_TO)
    expect(report.income).toBe(590000)
  })
})
