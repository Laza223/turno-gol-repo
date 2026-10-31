import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { cleanupAll, createTestStaffUser, createTestTenant, ensureRoles } from '../helpers/tenant'
import {
  ensureReferralCode,
  assignReferrer,
  resolveSignupReferrer,
} from '@/modules/referrals/referral.service'
import { getStaffSignupReferral } from '@/modules/staff/staff.service'
import { createTenantWithTrial } from '@/modules/tenants/tenant.service'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await cleanupAll(getSql())
  await closeSql()
})

describe('getStaffSignupReferral + resolveSignupReferrer — B2 contra Postgres real', () => {
  it('lee el código real, y resuelve el tenant referidor', async () => {
    const referrer = await createTestTenant()
    const code = await ensureReferralCode(referrer.id)
    const staff = await createTestStaffUser()

    const sql = getSql()
    // postgres-js no serializa un `Date` crudo en un tagged template (a
    // diferencia de Drizzle) — mismo gotcha que raw-sql-execute-date-string.
    await sql`
      UPDATE staff_users
      SET signup_referral_code = ${code}, created_at = ${'2026-10-15T00:00:00.000Z'}
      WHERE id = ${staff.id}
    `

    const signup = await getStaffSignupReferral(staff.id)
    expect(signup?.signupReferralCode).toBe(code)

    const resolved = await resolveSignupReferrer({
      code: signup?.signupReferralCode ?? null,
    })
    expect(resolved).toBe(referrer.id)
  })

  it('cuenta creada después del 31/10 (ya no hay corte) → sí atribuye', async () => {
    const referrer = await createTestTenant()
    const code = await ensureReferralCode(referrer.id)
    const staff = await createTestStaffUser()

    const sql = getSql()
    const afterOldCutoff = new Date('2026-11-02T12:00:00.000Z')
    await sql`
      UPDATE staff_users
      SET signup_referral_code = ${code}, created_at = ${afterOldCutoff.toISOString()}
      WHERE id = ${staff.id}
    `

    const signup = await getStaffSignupReferral(staff.id)
    const resolved = await resolveSignupReferrer({
      code: signup?.signupReferralCode ?? null,
    })
    expect(resolved).toBe(referrer.id)
  })
})

describe('createTenantWithTrial — referred_by_tenant_id (B2) contra Postgres real', () => {
  it('inserta el tenant con el referidor ya resuelto, en el mismo insert', async () => {
    const referrer = await createTestTenant()
    const staff = await createTestStaffUser()

    const tenant = await createTenantWithTrial({
      name: 'Complejo Referido Test',
      address: 'Calle 123',
      city: 'CABA',
      province: 'Buenos Aires',
      phone: '1122334455',
      email: 'referido-test@test.local',
      staffUserId: staff.id,
      referredByTenantId: referrer.id,
    })

    const sql = getSql()
    const [row] = await sql<{ referred_by_tenant_id: string }[]>`
      SELECT referred_by_tenant_id FROM tenants WHERE id = ${tenant.id}
    `
    expect(row.referred_by_tenant_id).toBe(referrer.id)
  })

  it('todo complejo nuevo nace con su propio código de referido (programa permanente)', async () => {
    const staff = await createTestStaffUser()

    const tenant = await createTenantWithTrial({
      name: 'Complejo Con Codigo',
      address: 'Calle 123',
      city: 'CABA',
      province: 'Buenos Aires',
      phone: '1122334455',
      email: 'con-codigo-test@test.local',
      staffUserId: staff.id,
    })

    const sql = getSql()
    const [row] = await sql<{ referral_code: string | null }[]>`
      SELECT referral_code FROM tenants WHERE id = ${tenant.id}
    `
    expect(row.referral_code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/)
  })

  it('el CHECK tenants_referred_by_not_self rechaza que un tenant sea su propio referidor', async () => {
    const staff = await createTestStaffUser()
    const selfId = crypto.randomUUID()

    await expect(
      createTenantWithTrial({
        name: 'Complejo Autoreferido',
        address: 'Calle 123',
        city: 'CABA',
        province: 'Buenos Aires',
        phone: '1122334455',
        email: 'autoreferido-test@test.local',
        staffUserId: staff.id,
        id: selfId,
        referredByTenantId: selfId,
      }),
    ).rejects.toThrow()
  })
})

describe('assignReferrer — B2 contra Postgres real', () => {
  it('asigna el referidor y lo deja visible en la fila real del tenant', async () => {
    const referrer = await createTestTenant()
    const code = await ensureReferralCode(referrer.id)
    const referred = await createTestTenant()

    const result = await assignReferrer(referred.id, code)

    expect(result).toEqual({ ok: true, referrerName: referrer.name })
    const sql = getSql()
    const [row] = await sql<{ referred_by_tenant_id: string }[]>`
      SELECT referred_by_tenant_id FROM tenants WHERE id = ${referred.id}
    `
    expect(row.referred_by_tenant_id).toBe(referrer.id)
  })

  it('un tenant que ya tiene referidor no se puede reasignar (UPDATE condicional en 0 filas)', async () => {
    const referrerA = await createTestTenant()
    const codeA = await ensureReferralCode(referrerA.id)
    const referrerB = await createTestTenant()
    const codeB = await ensureReferralCode(referrerB.id)
    const referred = await createTestTenant()

    const first = await assignReferrer(referred.id, codeA)
    expect(first.ok).toBe(true)

    const second = await assignReferrer(referred.id, codeB)
    expect(second).toEqual({ ok: false, reason: 'not_eligible' })

    const sql = getSql()
    const [row] = await sql<{ referred_by_tenant_id: string }[]>`
      SELECT referred_by_tenant_id FROM tenants WHERE id = ${referred.id}
    `
    // El primero ganó — el segundo no lo pisó.
    expect(row.referred_by_tenant_id).toBe(referrerA.id)
  })

  it('un complejo no puede ser asignado como su propio referidor', async () => {
    const tenant = await createTestTenant()
    const code = await ensureReferralCode(tenant.id)

    const result = await assignReferrer(tenant.id, code)

    expect(result).toEqual({ ok: false, reason: 'self' })
  })
})
