import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'

let tenantA: { id: string }
let tenantB: { id: string }
let seedA: IsolationSeed
let seedB: IsolationSeed

beforeAll(async () => {
  const s = getSql()
  await ensureRoles(s)
  await cleanupAll(s)
  tenantA = await createTestTenant(s)
  tenantB = await createTestTenant(s)
  seedA = await seedIsolationData(s, tenantA.id)
  seedB = await seedIsolationData(s, tenantB.id)
}, 30_000)

afterAll(async () => closeSql())

describe('RLS pool poisoning: SET LOCAL is transaction-scoped', () => {
  it('after withTenantContext(A) ends, a new tx without context sees 0 isolated rows', async () => {
    // Run as A, do something
    await withTenantContext(tenantA.id, async (tx) => {
      const rows = await tx.execute(drizzleSql`
        SELECT id FROM courts WHERE id = ${seedA.courtId} LIMIT 1
      `)
      expect((rows as unknown as unknown[]).length).toBeGreaterThan(0)
    })

    // Now run a tx WITHOUT setting tenant context, using turnogol_app role
    const s = getSql()
    const leaked = await s.begin(async (tx) => {
      await tx`SET LOCAL ROLE turnogol_app`
      // NO SET LOCAL app.current_tenant_id
      const rows = await tx<{ id: string }[]>`
        SELECT id FROM courts LIMIT 5
      `
      return rows
    })
    // RLS should filter all rows because no tenant context
    expect(leaked.length).toBe(0)
  }, 30_000)

  it('sequential as turnogol_app role: tenant A then B → B does NOT see A data', async () => {
    const s = getSql()

    const aRows = await s.begin(async (tx) => {
      await tx`SET LOCAL ROLE turnogol_app`
      await tx`SELECT set_config('app.current_tenant_id', ${tenantA.id}, true)`
      return tx<{ id: string }[]>`SELECT id FROM courts`
    })
    expect(aRows.map((x) => x.id)).toContain(seedA.courtId)
    expect(aRows.map((x) => x.id)).not.toContain(seedB.courtId)

    const bRows = await s.begin(async (tx) => {
      await tx`SET LOCAL ROLE turnogol_app`
      await tx`SELECT set_config('app.current_tenant_id', ${tenantB.id}, true)`
      return tx<{ id: string }[]>`SELECT id FROM courts`
    })
    expect(bRows.map((x) => x.id)).toContain(seedB.courtId)
    expect(bRows.map((x) => x.id)).not.toContain(seedA.courtId)
  }, 30_000)

  it('parallel as turnogol_app role: tenant A + B simultáneos → no cross-leak', async () => {
    const s = getSql()
    const [aRows, bRows] = await Promise.all([
      s.begin(async (tx) => {
        await tx`SET LOCAL ROLE turnogol_app`
        await tx`SELECT set_config('app.current_tenant_id', ${tenantA.id}, true)`
        return tx<{ id: string }[]>`SELECT id FROM courts`
      }),
      s.begin(async (tx) => {
        await tx`SET LOCAL ROLE turnogol_app`
        await tx`SELECT set_config('app.current_tenant_id', ${tenantB.id}, true)`
        return tx<{ id: string }[]>`SELECT id FROM courts`
      }),
    ])
    expect(aRows.map((x) => x.id)).toContain(seedA.courtId)
    expect(aRows.map((x) => x.id)).not.toContain(seedB.courtId)
    expect(bRows.map((x) => x.id)).toContain(seedB.courtId)
    expect(bRows.map((x) => x.id)).not.toContain(seedA.courtId)
  }, 30_000)
})
