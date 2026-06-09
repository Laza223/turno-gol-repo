import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'
import { insertBooking, insertCourt, insertPayment } from '../helpers/factories'

vi.mock('@/shared/middleware/with-player', () => ({
  withPlayer: (handler: (req: NextRequest, user: { playerId: string }, tx: unknown) => unknown) =>
    async (req: NextRequest) => {
      const playerId = (globalThis as Record<string, unknown>).__AS_PLAYER__ as string
      const { getDb } = await import('@/shared/db/client')
      const { sql } = await import('drizzle-orm')
      return getDb().transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE authenticated`)
        await tx.execute(sql`SELECT set_config('app.current_player_id', ${playerId}, true)`)
        return handler(req, { playerId }, tx)
      })
    },
}))

import { GET as exportData } from '@/app/api/player/data-export/route'

let tenant: { id: string }
let player: { id: string; email: string }

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  // NOTE: do NOT use seedIsolationData here — it inserts a random-day abonado
  // that pollutes other tests (race-abonado-vs-individual checks for empty
  // abonado state). We only need court + player + booking + payment.
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  const courtId = await insertCourt(sql, tenant.id)

  player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)

  const bookingId = await insertBooking(sql, {
    tenantId: tenant.id,
    courtId,
    playerId: player.id,
    timeStart: '19:00',
    timeEnd: '20:00',
    status: 'confirmed',
    depositStatus: 'not_required',
    depositAmount: 0,
  })
  await insertPayment(sql, { tenantId: tenant.id, bookingId, playerId: player.id })

  ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = player.id
}, 30_000)

afterAll(async () => {
  // Cleanup so other test files starting with a fresh DB find tables empty.
  await cleanupAll(getSql())
  await closeSql()
})

describe('ARCO data export endpoint (B9.2 — Ley 25.326 Art. 14)', () => {
  it('returns full player bundle (profile + bookings + payments + consents)', async () => {
    const req = new NextRequest('http://localhost/api/player/data-export')
    const res = await exportData(req)
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.data).toBeDefined()
    expect(json.data.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(json.data.retention_policy).toEqual({
      bookings: '12 months',
      payments: '5 years (legal AFIP retention)',
      audit_logs: '12 months',
    })
  })

  it('profile contains email, names, status, consents', async () => {
    const res = await exportData(new NextRequest('http://localhost/api/player/data-export'))
    const json = await res.json()

    expect(json.data.profile.id).toBe(player.id)
    expect(json.data.profile.email).toBe(player.email)
    expect(json.data.profile.first_name).toBeTruthy()
    expect(json.data.profile.status).toBe('active')
    expect(json.data.profile.agreed_to_terms_at).toBeTruthy()
    expect(json.data.profile.terms_version).toBe('v1')

    expect(json.data.consents).toMatchObject({
      terms_accepted: true,
      terms_version: 'v1',
      over_18_declaration: true,
    })
  })

  it('includes bookings array with the seeded booking', async () => {
    const res = await exportData(new NextRequest('http://localhost/api/player/data-export'))
    const json = await res.json()

    expect(Array.isArray(json.data.bookings)).toBe(true)
    expect(json.data.bookings.length).toBeGreaterThanOrEqual(1)
    expect(json.data.bookings[0]).toHaveProperty('id')
    expect(json.data.bookings[0]).toHaveProperty('tenant_id', tenant.id)
    expect(json.data.bookings[0]).toHaveProperty('court_id')
    expect(json.data.bookings[0]).toHaveProperty('status', 'confirmed')
  })

  it('includes payments array with the seeded payment', async () => {
    const res = await exportData(new NextRequest('http://localhost/api/player/data-export'))
    const json = await res.json()

    expect(Array.isArray(json.data.payments)).toBe(true)
    expect(json.data.payments.length).toBeGreaterThanOrEqual(1)
    expect(json.data.payments[0]).toHaveProperty('amount')
    expect(json.data.payments[0]).toHaveProperty('status')
  })

  it('includes tenant_relationships array', async () => {
    const res = await exportData(new NextRequest('http://localhost/api/player/data-export'))
    const json = await res.json()

    expect(Array.isArray(json.data.tenant_relationships)).toBe(true)
    expect(json.data.tenant_relationships.length).toBeGreaterThanOrEqual(1)
    expect(json.data.tenant_relationships[0]).toHaveProperty('tenant_id', tenant.id)
  })

  it('RLS isolation: another player cannot read this player export', async () => {
    const sql = getSql()
    const otherPlayer = await createTestPlayer(sql)
    await linkPlayerToTenant(sql, tenant.id, otherPlayer.id)
    ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = otherPlayer.id

    const res = await exportData(new NextRequest('http://localhost/api/player/data-export'))
    expect(res.status).toBe(200)
    const json = await res.json()
    // Other player has no bookings/payments — bundle is empty for them.
    expect(json.data.profile.id).toBe(otherPlayer.id)
    expect(json.data.bookings.length).toBe(0)
    expect(json.data.payments.length).toBe(0)

    // Reset for next tests.
    ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = player.id
  })
})
