/**
 * Métricas: "Por qué se cayeron turnos" (migr. 109). Cuenta solo cancelaciones del
 * mes con motivo cerrado, de este complejo, de mayor a menor.
 *
 * Requires a running Supabase instance (`supabase start`) con DATABASE_URL.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'
import { getCancelReasonsForMonth } from '@/modules/reports/report.service'
import { artTodayStr } from '@/shared/dates/art'

async function setup() {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const [court] = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenant.id}, 'Cancha CR', 10, ${sql.json({ rules: [] })}, 'online')
    RETURNING id
  `
  return { tenantId: tenant.id, courtId: court!.id }
}

let hour = 0
async function seedCanceled(
  s: { tenantId: string; courtId: string },
  code: string | null,
  opts: { canceledAt?: string; status?: string } = {},
) {
  hour += 1
  const startsAt = new Date(Date.now() + hour * 3600_000).toISOString()
  const endsAt = new Date(Date.now() + (hour + 1) * 3600_000).toISOString()
  await getSql()`
    INSERT INTO bookings (
      tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
      type, status, price_snapshot, deposit_amount, deposit_status, guest_name,
      canceled_by, canceled_at, canceled_reason_code
    )
    VALUES (
      ${s.tenantId}, ${s.courtId}, ${startsAt.slice(0, 10)}::date, '10:00', '11:00',
      ${startsAt}::timestamptz, ${endsAt}::timestamptz,
      'spontaneous', ${opts.status ?? 'canceled_no_refund'}::booking_status, 100, 0,
      'not_required'::deposit_status, 'Joaco',
      'player', ${opts.canceledAt ?? new Date().toISOString()}::timestamptz,
      ${code}::cancel_reason
    )
  `
}

beforeAll(async () => {
  await ensureRoles()
})
beforeEach(async () => {
  await cleanupAll()
})
afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('getCancelReasonsForMonth', () => {
  it('agrupa por motivo, de mayor a menor, e ignora sin código, otros meses y otros complejos', async () => {
    const s = await setup()
    const other = await setup()
    await seedCanceled(s, 'rain')
    await seedCanceled(s, 'rain')
    await seedCanceled(s, 'no_players', { status: 'canceled_refunded' })
    await seedCanceled(s, null)
    await seedCanceled(s, 'other', { canceledAt: '2020-01-15T12:00:00Z' })
    await seedCanceled(other, 'rain')

    const res = await getCancelReasonsForMonth(s.tenantId, artTodayStr().slice(0, 7), 0)
    expect(res).toEqual({
      total: 3,
      byReason: [
        { reason: 'rain', count: 2 },
        { reason: 'no_players', count: 1 },
      ],
    })
  })

  it('un mes sin cancelaciones con motivo da total 0', async () => {
    const s = await setup()
    const res = await getCancelReasonsForMonth(s.tenantId, '2020-02', 0)
    expect(res).toEqual({ total: 0, byReason: [] })
  })
})
