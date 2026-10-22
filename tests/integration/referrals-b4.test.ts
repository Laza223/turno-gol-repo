import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'
import { listMyReferrals } from '@/modules/referrals/referral.service'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await cleanupAll(getSql())
  await closeSql()
})

describe('listMyReferrals — B4 contra Postgres real', () => {
  it('devuelve solo los referidos del tenant pedido, sin deleted, nuevo primero, y sin columnas de más', async () => {
    const referrer = await createTestTenant()
    const otherReferrer = await createTestTenant()
    const old = await createTestTenant()
    const recent = await createTestTenant()
    const deleted = await createTestTenant()
    const ofOther = await createTestTenant()

    const sql = getSql()
    await sql`
      UPDATE tenants SET referred_by_tenant_id = ${referrer.id}, referral_reward_status = 'earned',
        created_at = ${'2026-10-01T12:00:00.000Z'}
      WHERE id = ${old.id}
    `
    await sql`
      UPDATE tenants SET referred_by_tenant_id = ${referrer.id}, created_at = ${'2026-10-10T12:00:00.000Z'}
      WHERE id = ${recent.id}
    `
    await sql`
      UPDATE tenants SET referred_by_tenant_id = ${referrer.id}, status = 'deleted'
      WHERE id = ${deleted.id}
    `
    await sql`UPDATE tenants SET referred_by_tenant_id = ${otherReferrer.id} WHERE id = ${ofOther.id}`

    const list = await listMyReferrals(referrer.id)

    expect(list.map((r) => r.id)).toEqual([recent.id, old.id])
    expect(list[0]!.rewardStatus).toBeNull()
    expect(list[1]!.rewardStatus).toBe('earned')
    for (const r of list) {
      expect(Object.keys(r).sort()).toEqual(['createdAt', 'id', 'name', 'rewardStatus'])
    }
  })

  it('un tenant sin invitados → lista vacía', async () => {
    const lonely = await createTestTenant()
    expect(await listMyReferrals(lonely.id)).toEqual([])
  })
})
