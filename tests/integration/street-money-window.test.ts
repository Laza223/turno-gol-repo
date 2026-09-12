/**
 * B11 — la ventana de "plata en la calle" llega a los TRES orígenes.
 *
 * `getStreetMoney` muestra por defecto los últimos `STREET_MONEY_DEFAULT_MONTHS`
 * meses y trae todo con `'all'`. La deuda vieja no desaparece ni deja de
 * deberse: se esconde detrás de un rótulo que dice qué se está viendo.
 *
 * Lo que estos casos protegen es que el corte se aplique a los tres orígenes y
 * no solo a los turnos. Si llegara a uno y no a los otros, la pantalla diría
 * "últimos 12 meses" mientras sigue sumando un fiado de hace dos años, y nadie
 * lo vería: no hay error, solo un total que no cuadra con su propio rótulo.
 *
 * Venía de `street-money-total.test.ts`, que además comparaba la lista contra
 * `getStreetMoneyTotal`. Esa segunda ruta se eliminó con el rediseño de Caja
 * (2026-09-12) porque la pantalla que muestra el total ya muestra la lista;
 * estos casos siguen valiendo por sí solos y por eso se conservan.
 *
 * Requires a running Supabase instance (`supabase start`) con DATABASE_URL.
 * Falla si la DB no está disponible: sin base no hay señal que dar.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { getStreetMoney, sumStreetMoney } from '@/modules/cashflow/street-money.service'
import {
  DEFAULT_STREET_MONEY_WINDOW,
  type StreetMoneyWindow,
} from '@/modules/cashflow/street-money-window'

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha B11'}, ${10},
      ${sql.json({
        rules: [
          {
            days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            from: '08:00',
            to: '23:00',
            price: 800000,
          },
        ],
      })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

/** Un turno jugado y NO cobrado: la primera fuente de deuda. */
async function insertCompletedBooking(
  tenantId: string,
  courtId: string,
  playerId: string,
  price: number,
  opts: { date?: string } = {},
): Promise<string> {
  const sql = getSql()
  const date = opts.date ?? '2030-02-04'
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at, type, status, price_snapshot,
      deposit_amount, deposit_status
    )
    VALUES (
      ${tenantId}, ${courtId}, ${playerId}, ${date}::date, '20:00'::time, '21:00'::time,
      ${`${date}T20:00:00-03:00`}::timestamptz, ${`${date}T21:00:00-03:00`}::timestamptz,
      'spontaneous', 'completed', ${price},
      0, 'not_required'::deposit_status
    )
    RETURNING id
  `
  return rows[0]!.id
}

/** Un fiado de cantina abierto: la segunda fuente. `created_by` es NOT NULL. */
async function insertOpenTab(tenantId: string, amount: number, staffUserId: string): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO canteen_tabs (tenant_id, debtor_name, total_amount, status, created_by)
    VALUES (${tenantId}, ${'Fiado de prueba'}, ${amount}, 'open', ${staffUserId})
  `
}

/** Staff del complejo — lo exige `canteen_tabs.created_by`. */
async function staffFor(tenantId: string): Promise<string> {
  const sql = getSql()
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenantId, staff.id)
  return staff.id
}

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('ventana de 12 meses (B11)', () => {
  /** Fecha ART de hace `months` meses, en YYYY-MM-DD. */
  const monthsAgo = (months: number): string => {
    const d = new Date()
    d.setUTCMonth(d.getUTCMonth() - months)
    return d.toISOString().slice(0, 10)
  }

  const withWindow = (tenantId: string, window: StreetMoneyWindow) =>
    withTenantContext(tenantId, async (tx) => {
      const rows = await getStreetMoney(tenantId, tx, window)
      return { total: sumStreetMoney(rows), filas: rows.length }
    })

  it('una deuda de hace 18 meses queda FUERA por defecto y aparece con "all"', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const player = await createTestPlayer(sql)
    await insertCompletedBooking(tenant.id, courtId, player.id, 800000, {
      date: monthsAgo(18),
    })

    const porDefecto = await withWindow(tenant.id, DEFAULT_STREET_MONEY_WINDOW)
    expect(porDefecto.filas).toBe(0)
    expect(porDefecto.total).toBe(0)

    const todas = await withWindow(tenant.id, 'all')
    expect(todas.filas).toBe(1)
    expect(todas.total).toBe(800000)
  })

  it('una deuda de hace 3 meses entra en las dos ventanas', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const player = await createTestPlayer(sql)
    await insertCompletedBooking(tenant.id, courtId, player.id, 500000, { date: monthsAgo(3) })

    expect((await withWindow(tenant.id, DEFAULT_STREET_MONEY_WINDOW)).total).toBe(500000)
    expect((await withWindow(tenant.id, 'all')).total).toBe(500000)
  })

  it('con deuda vieja y nueva mezcladas, solo la nueva entra por defecto', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const courtId = await insertCourt(tenant.id)
    const player = await createTestPlayer(sql)
    await insertCompletedBooking(tenant.id, courtId, player.id, 800000, { date: monthsAgo(20) })
    await insertCompletedBooking(tenant.id, courtId, player.id, 300000, { date: monthsAgo(2) })

    const porDefecto = await withWindow(tenant.id, DEFAULT_STREET_MONEY_WINDOW)
    expect(porDefecto.filas).toBe(1)
    expect(porDefecto.total).toBe(300000)

    const todas = await withWindow(tenant.id, 'all')
    expect(todas.filas).toBe(2)
    expect(todas.total).toBe(1_100_000)
  })

  it('un fiado de cantina viejo también respeta la ventana (los 3 orígenes, no solo turnos)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staffId = await staffFor(tenant.id)
    await insertOpenTab(tenant.id, 45000, staffId)
    // El helper inserta con NOW(); lo envejecemos para cruzar la ventana.
    await sql`
      UPDATE canteen_tabs SET created_at = NOW() - INTERVAL '20 months'
      WHERE tenant_id = ${tenant.id}
    `

    expect((await withWindow(tenant.id, DEFAULT_STREET_MONEY_WINDOW)).total).toBe(0)

    const todas = await withWindow(tenant.id, 'all')
    expect(todas.filas).toBe(1)
    expect(todas.total).toBe(45000)
  })
})
