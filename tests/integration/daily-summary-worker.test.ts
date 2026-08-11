import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { getBoss, stopBoss } from '@/shared/jobs/boss'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import { runDailySummarySweep } from '@/shared/jobs/workers/daily-summary.worker'
import { artDateOf } from '@/shared/time/art-date'
import { addDays } from '@/shared/dates/art'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
  type TestTenant,
} from '../helpers/tenant'

/**
 * D8 (Fase 2 — docs/planning/2026-08-01-decisiones-de-fase-v2.md §3): el
 * resumen diario reusa getHoyData con date=AYER. Este archivo verifica que
 * el sweep encola push SIEMPRE (si hay suscripción) y encola email SOLO si
 * el tenant activó el opt-in — nunca al revés.
 */

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)
  await getBoss()
}, 30_000)

afterAll(async () => {
  try {
    await stopBoss()
    await closeSql()
  } catch {
    /* best-effort */
  }
})

async function seedTenantWithYesterdayActivity(
  emailOptIn: boolean,
): Promise<{ tenant: TestTenant; staffId: string; subId: string }> {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)

  if (emailOptIn) {
    await sql`UPDATE tenants SET settings = settings || ${sql.json({ daily_summary_email_opt_in: true })} WHERE id = ${tenant.id}`
  }

  const subRows = await sql<{ id: string }[]>`
    INSERT INTO push_subscriptions (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
    VALUES (${tenant.id}, ${staff.id}, ${`https://push.example.com/daily-summary-test-${crypto.randomUUID()}`}, ${'p256dh-key'}, ${'auth-key'})
    RETURNING id
  `

  // Actividad de ayer: un cash_flow + cierre de caja (para exigir "caja cerrada sin diferencia").
  // Tenant de test → closesNextDay=false → cutoffMins=0 → operatingDateOf === artDateOf.
  const today = artDateOf(new Date())
  const yesterdayDate = addDays(today, -1)
  const yesterdayNoon = new Date(`${yesterdayDate}T15:00:00Z`) // seguro dentro del rango ART del día

  await withTenantContext(tenant.id, (tx) =>
    createCashFlow(
      tenant.id,
      staff.id,
      { type: 'income', category: 'other', amount: 900000, method: 'cash', description: 'Ayer', occurredAt: yesterdayNoon },
      tx,
    ),
  )
  await withTenantContext(tenant.id, (tx) => closeDailyRegister(tenant.id, yesterdayDate, staff.id, {}, 0, tx))

  return { tenant, staffId: staff.id, subId: subRows[0]!.id }
}

describe('daily-summary.worker — resumen diario (D8)', () => {
  it('encola push siempre; NO encola email si el tenant no activó el opt-in', async () => {
    const sql = getSql()
    const { tenant, subId } = await seedTenantWithYesterdayActivity(false)
    await sql`DELETE FROM pgboss.job WHERE name = 'push-send'`

    await runDailySummarySweep()

    const jobs = await sql<{ data: unknown }[]>`
      SELECT data FROM pgboss.job WHERE name = 'push-send' AND data->>'subscription_id' = ${subId}
    `
    expect(jobs).toHaveLength(1)
    const jobData = jobs[0]!.data as { payload: { type: string; summaryLabel: string }; dedupeKey?: string }
    expect(jobData.payload.type).toBe('daily_summary')
    expect(jobData.payload.summaryLabel).toContain('9.000')
    expect(jobData.payload.summaryLabel).toContain('caja cerrada sin diferencia')
    // Hallazgo de revisión adversarial: sin dedupeKey, un retry de pg-boss
    // (retryLimit=3 real en push-send) duplicaría el push visible al admin —
    // push.worker.ts solo reclama push_send_log si dedupeKey viene seteada.
    expect(jobData.dedupeKey).toMatch(new RegExp(`^push:daily-summary:${tenant.id}:\\d{4}-\\d{2}-\\d{2}:${subId}$`))

    const notifs = await sql<{ id: string }[]>`
      SELECT id FROM notifications WHERE tenant_id = ${tenant.id} AND template_name = 'daily_summary'
    `
    expect(notifs).toHaveLength(0)
  }, 30_000)

  it('encola push Y notificación de email cuando el tenant activó el opt-in', async () => {
    const sql = getSql()
    const { tenant, subId } = await seedTenantWithYesterdayActivity(true)
    await sql`DELETE FROM pgboss.job WHERE name = 'push-send'`

    await runDailySummarySweep()

    const jobs = await sql<{ id: string }[]>`
      SELECT id FROM pgboss.job WHERE name = 'push-send' AND data->>'subscription_id' = ${subId}
    `
    expect(jobs).toHaveLength(1)

    const notifs = await sql<{ template_name: string; content: unknown }[]>`
      SELECT template_name, content FROM notifications
      WHERE tenant_id = ${tenant.id} AND template_name = 'daily_summary'
    `
    expect(notifs).toHaveLength(1)
    const content = notifs[0]!.content as { collectedArs: string; cashClosed: boolean }
    expect(content.collectedArs).toContain('9.000')
    expect(content.cashClosed).toBe(true)
  }, 30_000)

  it('no procesa tenants bloqueados', async () => {
    const sql = getSql()
    const { tenant, subId } = await seedTenantWithYesterdayActivity(false)
    await sql`UPDATE tenants SET status = 'blocked' WHERE id = ${tenant.id}`
    await sql`DELETE FROM pgboss.job WHERE name = 'push-send'`

    await runDailySummarySweep()

    const jobs = await sql<{ id: string }[]>`
      SELECT id FROM pgboss.job WHERE name = 'push-send' AND data->>'subscription_id' = ${subId}
    `
    expect(jobs).toHaveLength(0)
  }, 30_000)

  it('no procesa tenants suspendidos (el nombre del test anterior lo prometía sin probarlo — hallazgo de revisión adversarial)', async () => {
    const sql = getSql()
    const { tenant, subId } = await seedTenantWithYesterdayActivity(false)
    await sql`UPDATE tenants SET status = 'suspended' WHERE id = ${tenant.id}`
    await sql`DELETE FROM pgboss.job WHERE name = 'push-send'`

    await runDailySummarySweep()

    const jobs = await sql<{ id: string }[]>`
      SELECT id FROM pgboss.job WHERE name = 'push-send' AND data->>'subscription_id' = ${subId}
    `
    expect(jobs).toHaveLength(0)
  }, 30_000)
})
