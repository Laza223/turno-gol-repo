import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import { openDay } from '@/modules/cashflow/cash-open.service'
import { todayART } from '@/shared/time/art-date'

// Gap de recon (D4): daily-cash-open.test.ts ya cubre el UPSERT en secuencia
// (abrir, después corregir) pero no dos aperturas EN PARALELO sobre el MISMO
// tenant+fecha. El advisory lock `daily_close:{tenantId}` (mismo que usa
// closeDailyRegister) serializa las dos transacciones completas — ninguna
// debería rechazar, y la fila queda con el valor de la que corrió SEGUNDA
// (orden no determinístico bajo Promise.all, por eso el assert acepta los
// dos valores en vez de uno fijo).

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('daily_cash_opens — carrera open-vs-open (Promise.all, mismo tenant+fecha)', () => {
  it('dos aperturas concurrentes: 1 sola fila, valor de una de las dos, ninguna promesa rechaza, audit_logs con apertura+corrección', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const hoy = todayART()

    // Si CUALQUIERA de las dos promesas rechazara, este await lanzaría y el
    // test fallaría acá mismo — eso ES la prueba de "ninguna promesa rechaza".
    const [first, second] = await Promise.all([
      withTenantContext(tenant.id, (tx) =>
        openDay(tenant.id, staff.id, { date: hoy, openingCash: 70000, note: 'apertura A' }, tx),
      ),
      withTenantContext(tenant.id, (tx) =>
        openDay(tenant.id, staff.id, { date: hoy, openingCash: 90000, note: 'apertura B' }, tx),
      ),
    ])

    // Misma fila (unique tenant+date): el UPSERT nunca crea una segunda.
    expect(second.id).toBe(first.id)

    const rows = await sql<{ opening_cash: number }[]>`
      SELECT opening_cash FROM daily_cash_opens
      WHERE tenant_id = ${tenant.id} AND date = ${hoy}::date
    `
    expect(rows).toHaveLength(1)
    expect([70000, 90000]).toContain(rows[0]!.opening_cash)

    // Trazabilidad (mismo criterio que el test secuencial de
    // daily-cash-open.test.ts): la que corrió primera es "day_opened"
    // (previousOpeningCash null), la que corrió segunda es "open_corrected".
    const audits = await sql<
      { action: string; metadata: { previousOpeningCash: number | null } }[]
    >`
      SELECT action, metadata FROM audit_logs
      WHERE tenant_id = ${tenant.id} AND resource_type = 'daily_cash_open'
      ORDER BY created_at ASC
    `
    expect(audits).toHaveLength(2)
    expect(audits.map((a) => a.action)).toEqual(['cashflow.day_opened', 'cashflow.open_corrected'])
    expect(audits[0]!.metadata.previousOpeningCash).toBeNull()

    // Consistencia cruzada: el previousOpeningCash de la corrección tiene que
    // ser el COMPLEMENTO del valor final en daily_cash_opens (la que ganó
    // pisó a la que perdió, sin importar el orden real de ejecución).
    const finalValue = rows[0]!.opening_cash
    const previousValue = audits[1]!.metadata.previousOpeningCash
    expect(previousValue).toBe(finalValue === 70000 ? 90000 : 70000)
  })
})
