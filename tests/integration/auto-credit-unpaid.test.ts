/**
 * Acreditación automática de lo no cobrado a las 24 h
 * (`booking.auto-credit.ts` + `auto-credit-unpaid.worker.ts`, decisión del
 * dueño del 2026-09-26).
 *
 * El barrido es cross-tenant, así que cada test mira solo sus propios turnos.
 *
 * Requires a running Supabase instance (`supabase start`) con DATABASE_URL.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { getDebts } from '@/modules/bookings/booking.debts'
import {
  AUTO_CREDIT_DESCRIPTION,
  autoCreditIdempotencyKey,
} from '@/modules/bookings/booking.auto-credit'
import { runAutoCreditUnpaid } from '@/shared/jobs/workers/auto-credit-unpaid.worker'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const PRICE = 8_400_000
const HOUR = 3600_000

/** Instante ISO `hours` horas atrás. */
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString()

async function seedTenant(opts: { withAdmin?: boolean } = {}) {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  let adminId: string | null = null
  if (opts.withAdmin ?? true) {
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id, 'admin')
    adminId = staff.id
  }
  const court = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenant.id}, 'Cancha 1', 10, ${sql.json({ rules: [] })}, 'online')
    RETURNING id
  `
  return { tenantId: tenant.id, courtId: court[0]!.id, adminId }
}

/**
 * Turno `completed` que terminó hace `endedHoursAgo` horas y se tocó por última
 * vez hace `updatedHoursAgo` (por defecto, cuando terminó).
 */
async function seedCompleted(params: {
  tenantId: string
  courtId: string
  endedHoursAgo: number
  updatedHoursAgo?: number
  depositAmount?: number
  depositStatus?: 'not_required' | 'paid' | 'captured'
}) {
  const sql = getSql()
  const endsAt = ago(params.endedHoursAgo)
  const startsAt = ago(params.endedHoursAgo + 1)
  const date = startsAt.slice(0, 10)
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
      type, status, price_snapshot, deposit_amount, deposit_status, guest_name, updated_at
    )
    VALUES (
      ${params.tenantId}, ${params.courtId}, ${date}::date, '10:00', '11:00',
      ${startsAt}::timestamptz, ${endsAt}::timestamptz,
      'spontaneous', 'completed', ${PRICE}, ${params.depositAmount ?? 0},
      ${params.depositStatus ?? 'not_required'}::deposit_status, 'Joaco',
      ${ago(params.updatedHoursAgo ?? params.endedHoursAgo)}::timestamptz
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function seedCharge(tenantId: string, bookingId: string, staffId: string, amount: number) {
  const sql = getSql()
  await sql`
    INSERT INTO cash_flows (tenant_id, type, category, amount, method, description,
                            booking_id, registered_by, occurred_at)
    VALUES (${tenantId}, 'income', 'booking', ${amount}, 'mercadopago', 'Cobro de turno',
            ${bookingId}, ${staffId}, NOW() - interval '30 hours')
  `
}

type AutoRow = {
  amount: number
  method: string
  description: string
  registered_by: string
  client_idempotency_key: string
}

async function autoCredits(bookingId: string): Promise<AutoRow[]> {
  const sql = getSql()
  return sql<AutoRow[]>`
    SELECT amount, method::text AS method, description, registered_by, client_idempotency_key
    FROM cash_flows
    WHERE booking_id = ${bookingId} AND description = ${AUTO_CREDIT_DESCRIPTION}
  `
}

beforeAll(async () => {
  await ensureRoles(getSql())
})

afterAll(async () => {
  await cleanupAll(getSql())
  await closeSql()
})

describe('runAutoCreditUnpaid — acredita a las 24 h', () => {
  it('un turno sin cobro de hace 25 h se acredita entero, en efectivo y a nombre del admin', async () => {
    const { tenantId, courtId, adminId } = await seedTenant()
    const bookingId = await seedCompleted({ tenantId, courtId, endedHoursAgo: 25 })

    await runAutoCreditUnpaid()

    expect(await autoCredits(bookingId)).toEqual([
      {
        amount: PRICE,
        method: 'cash',
        description: AUTO_CREDIT_DESCRIPTION,
        registered_by: adminId,
        client_idempotency_key: autoCreditIdempotencyKey(bookingId),
      },
    ])

    // Deja de figurar como no cobrado.
    const debts = await withTenantContext(tenantId, (tx) => getDebts(tenantId, tx))
    expect(debts.map((d) => d.id)).not.toContain(bookingId)

    // Quién lo hizo de verdad queda en el audit log.
    const sql = getSql()
    const audits = await sql<{ actor_type: string; metadata: { amountCents: number } }[]>`
      SELECT actor_type::text AS actor_type, metadata FROM audit_logs
      WHERE resource_id = ${bookingId} AND action = 'booking.auto_credited'
    `
    expect(audits).toEqual([
      { actor_type: 'system', metadata: { amountCents: PRICE, method: 'cash' } },
    ])
  })

  it('a un turno a medias le acredita solo lo que falta', async () => {
    const { tenantId, courtId, adminId } = await seedTenant()
    const bookingId = await seedCompleted({ tenantId, courtId, endedHoursAgo: 30 })
    await seedCharge(tenantId, bookingId, adminId!, 4_200_000)

    await runAutoCreditUnpaid()

    expect((await autoCredits(bookingId)).map((r) => r.amount)).toEqual([4_200_000])
  })

  it('descuenta la seña pagada', async () => {
    const { tenantId, courtId } = await seedTenant()
    const bookingId = await seedCompleted({
      tenantId,
      courtId,
      endedHoursAgo: 30,
      depositAmount: 2_520_000,
      depositStatus: 'paid',
    })

    await runAutoCreditUnpaid()

    expect((await autoCredits(bookingId)).map((r) => r.amount)).toEqual([PRICE - 2_520_000])
  })

  it('descuenta también la seña capturada', async () => {
    const { tenantId, courtId } = await seedTenant()
    const bookingId = await seedCompleted({
      tenantId,
      courtId,
      endedHoursAgo: 30,
      depositAmount: 2_520_000,
      depositStatus: 'captured',
    })

    await runAutoCreditUnpaid()

    expect((await autoCredits(bookingId)).map((r) => r.amount)).toEqual([PRICE - 2_520_000])
  })

  it('no toca lo pagado entero, lo que terminó hace menos de 24 h ni lo que se tocó hace menos de 24 h', async () => {
    const { tenantId, courtId, adminId } = await seedTenant()
    const pagado = await seedCompleted({ tenantId, courtId, endedHoursAgo: 30 })
    await seedCharge(tenantId, pagado, adminId!, PRICE)
    const reciente = await seedCompleted({ tenantId, courtId, endedHoursAgo: 23 })
    // Terminó hace 30 h pero lo completaron hace 2: todavía se puede marcar ausente (P5).
    const recienCompletado = await seedCompleted({
      tenantId,
      courtId,
      endedHoursAgo: 30,
      updatedHoursAgo: 2,
    })

    await runAutoCreditUnpaid()

    expect(await autoCredits(pagado)).toEqual([])
    expect(await autoCredits(reciente)).toEqual([])
    expect(await autoCredits(recienCompletado)).toEqual([])
  })

  it('no corre en un complejo cancelado ni en uno sin admin activo', async () => {
    const sql = getSql()
    const cancelado = await seedTenant()
    await sql`UPDATE tenants SET status = 'canceled' WHERE id = ${cancelado.tenantId}`
    const enCancelado = await seedCompleted({ ...cancelado, endedHoursAgo: 30 })
    const sinAdmin = await seedTenant({ withAdmin: false })
    const enSinAdmin = await seedCompleted({ ...sinAdmin, endedHoursAgo: 30 })

    await runAutoCreditUnpaid()

    expect(await autoCredits(enCancelado)).toEqual([])
    expect(await autoCredits(enSinAdmin)).toEqual([])
  })

  it('correr dos veces no acredita dos veces', async () => {
    const { tenantId, courtId } = await seedTenant()
    const bookingId = await seedCompleted({ tenantId, courtId, endedHoursAgo: 26 })

    await runAutoCreditUnpaid()
    await runAutoCreditUnpaid()

    expect(await autoCredits(bookingId)).toHaveLength(1)
  })
})
