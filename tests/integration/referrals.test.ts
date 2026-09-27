import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'
import { ensureReferralCode, resolveReferralCode } from '@/modules/referrals/referral.service'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await cleanupAll(getSql())
  await closeSql()
})

describe('ensureReferralCode', () => {
  it('es idempotente: dos llamadas devuelven el mismo código', async () => {
    const { id } = await createTestTenant()

    const first = await ensureReferralCode(id)
    const second = await ensureReferralCode(id)

    expect(second).toBe(first)
    expect(first).toMatch(/^[A-HJKMNP-Z2-9]{8}$/)
  })

  it('no pisa un código existente', async () => {
    const { id } = await createTestTenant()
    const original = await ensureReferralCode(id)

    await ensureReferralCode(id)

    const sql = getSql()
    const [row] = await sql<{ referral_code: string }[]>`
      SELECT referral_code FROM tenants WHERE id = ${id}
    `
    expect(row.referral_code).toBe(original)
  })
})

describe('resolveReferralCode', () => {
  it('resuelve el tenant activo dueño del código', async () => {
    const { id, name } = await createTestTenant()
    const code = await ensureReferralCode(id)

    expect(await resolveReferralCode(code)).toEqual({ tenantId: id, name })
  })

  it('excluye a un tenant churned', async () => {
    const { id } = await createTestTenant()
    const code = await ensureReferralCode(id)
    const sql = getSql()
    await sql`UPDATE tenants SET status = 'churned'::tenant_status WHERE id = ${id}`

    expect(await resolveReferralCode(code)).toBeNull()
  })

  it('código con formato válido pero que no pertenece a nadie devuelve null', async () => {
    expect(await resolveReferralCode('ZZZZZZZZ')).toBeNull()
  })
})
