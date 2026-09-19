/**
 * Integration test: GET /api/admin/metrics (métricas de negocio del complejo).
 *
 * 2026-09-19: las métricas del negocio son SOLO del dueño. Antes eran
 * operator-level (admin + manager, `withAnyRole`) y el encargado las veía en
 * /analiticas; ahora la página y sus dos endpoints (esta y /api/reports/revenue)
 * exigen rol admin leído de `tenant_staff_members`, nunca del claim del JWT.
 *
 * Requires a running Supabase instance (`supabase start`) con DATABASE_URL.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '@/modules/auth/types'

// Auth boundary mock — must be hoisted before route import.
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { closeSql, getSql } from '@/shared/db/client'
import { GET as getMetrics } from '@/app/api/admin/metrics/route'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const asUser = (user: AuthUser | null) => vi.mocked(extractAuthUser).mockResolvedValue(user)

let tenantId: string
let adminStaffId: string
let managerStaffId: string

// El claim `role` del JWT viene hardcodeado a 'admin' para todo el staff: si el
// guard lo creyera, el caso del encargado devolvería 200.
const makeStaffUser = (staffUserId: string): AuthUser => ({
  type: 'staff',
  id: 'auth-uuid-test',
  email: 'staff@test.local',
  staffUserId,
  tenantId,
  role: 'admin',
})

const metricsRequest = () =>
  new Request('http://localhost/api/admin/metrics') as unknown as Parameters<typeof getMetrics>[0]

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)

  const tenant = await createTestTenant(sql)
  tenantId = tenant.id

  const admin = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, admin.id, 'admin')
  adminStaffId = admin.id

  const manager = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, manager.id, 'manager')
  managerStaffId = manager.id
}, 30_000)

afterAll(async () => {
  try {
    await closeSql()
  } catch {
    // best-effort cleanup
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/metrics — solo admin', () => {
  it('rechaza al encargado aunque su JWT diga role=admin', async () => {
    asUser(makeStaffUser(managerStaffId))
    const res = await getMetrics(metricsRequest())
    expect(res.status).toBe(403)
  })

  it('rechaza a un usuario sin sesión', async () => {
    asUser(null)
    const res = await getMetrics(metricsRequest())
    expect(res.status).toBe(401)
  })

  it('deja ver las métricas al admin', async () => {
    asUser(makeStaffUser(adminStaffId))
    const res = await getMetrics(metricsRequest())
    expect(res.status).toBe(200)
  })
})
