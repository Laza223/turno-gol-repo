import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { getBoss, stopBoss } from '@/shared/jobs/boss'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
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

  // Actividad de ayer: un cash_flow.
  // Tenant de test → closesNextDay=false → cutoffMins=0 → operatingDateOf === artDateOf.
  const today = artDateOf(new Date())
  const yesterdayDate = addDays(today, -1)
  const yesterdayNoon = new Date(`${yesterdayDate}T15:00:00Z`) // seguro dentro del rango ART del día

  await withTenantContext(tenant.id, (tx) =>
    createCashFlow(
      tenant.id,
      staff.id,
      {
        type: 'income',
        category: 'other',
        amount: 900000,
        method: 'cash',
        description: 'Ayer',
        occurredAt: yesterdayNoon,
      },
      tx,
    ),
  )

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
    const jobData = jobs[0]!.data as {
      payload: { type: string; summaryLabel: string }
      dedupeKey?: string
    }
    expect(jobData.payload.type).toBe('daily_summary')
    expect(jobData.payload.summaryLabel).toContain('9.000')
    // Hallazgo de revisión adversarial: sin dedupeKey, un retry de pg-boss
    // (retryLimit=3 real en push-send) duplicaría el push visible al admin —
    // push.worker.ts solo reclama push_send_log si dedupeKey viene seteada.
    expect(jobData.dedupeKey).toMatch(
      new RegExp(`^push:daily-summary:${tenant.id}:\\d{4}-\\d{2}-\\d{2}:${subId}$`),
    )

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
    const content = notifs[0]!.content as { collectedArs: string }
    expect(content.collectedArs).toContain('9.000')
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

/**
 * Resumen semanal: cuelga del mismo barrido. Sale los lunes con la semana
 * lun–dom que cerró, solo si el complejo lo prendió y solo a administradores.
 * El reloj se fija con `toFake: ['Date']`: pg-boss y postgres siguen con sus
 * timers reales.
 */
describe('daily-summary.worker — resumen semanal', () => {
  const MONDAY_8AM_ART = new Date('2026-10-19T11:00:00Z')
  const TUESDAY_8AM_ART = new Date('2026-10-20T11:00:00Z')

  // Semana que resume el lunes 19: lun 12 → dom 18. La anterior: 5 → 11.
  const WEEK_FLOWS = [
    { amount: 900000, method: 'cash' as const, occurredAt: new Date('2026-10-14T15:00:00Z') },
    { amount: 300000, method: 'transfer' as const, occurredAt: new Date('2026-10-18T23:30:00Z') },
  ]
  const OUTSIDE_FLOWS = [
    { amount: 800000, method: 'cash' as const, occurredAt: new Date('2026-10-07T15:00:00Z') },
    // Lunes 19 a la madrugada ART: ya es la semana siguiente, no entra.
    { amount: 500000, method: 'cash' as const, occurredAt: new Date('2026-10-19T04:00:00Z') },
  ]

  async function seedWeeklyTenant(
    weeklyOptIn: boolean,
    flows = [...WEEK_FLOWS, ...OUTSIDE_FLOWS],
  ): Promise<{
    tenant: TestTenant
    adminId: string
    managerId: string
  }> {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const admin = await createTestStaffUser(sql)
    const manager = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, admin.id, 'admin')
    await linkStaffToTenant(sql, tenant.id, manager.id, 'manager')
    if (weeklyOptIn) {
      await sql`UPDATE tenants SET settings = settings || ${sql.json({ weekly_summary_email_opt_in: true })} WHERE id = ${tenant.id}`
    }

    for (const f of flows) {
      await withTenantContext(tenant.id, (tx) =>
        createCashFlow(
          tenant.id,
          admin.id,
          { type: 'income', category: 'other', description: 'Semana', ...f },
          tx,
        ),
      )
    }
    return { tenant, adminId: admin.id, managerId: manager.id }
  }

  async function runSweepAt(now: Date): Promise<void> {
    vi.useFakeTimers({ toFake: ['Date'], now })
    try {
      await runDailySummarySweep()
    } finally {
      vi.useRealTimers()
    }
  }

  async function weeklyNotifications(tenantId: string) {
    return getSql()<{ recipient_id: string; template_name: string; content: unknown }[]>`
      SELECT recipient_id, template_name, content FROM notifications
      WHERE tenant_id = ${tenantId} AND trigger_event = 'weekly_summary.sweep'
    `
  }

  it('el lunes encola el semanal solo al administrador, con la semana cerrada', async () => {
    const { tenant, adminId } = await seedWeeklyTenant(true)

    await runSweepAt(MONDAY_8AM_ART)

    const notifs = await weeklyNotifications(tenant.id)
    expect(notifs).toHaveLength(1)
    expect(notifs[0]!.recipient_id).toBe(adminId)
    expect(notifs[0]!.template_name).toBe('daily_summary')
    const content = notifs[0]!.content as {
      kind: string
      weekLabel: string
      totalArs: string
      comparison: { direction: string; label: string } | null
      methods: Array<{ label: string; amountArs: string }>
    }
    expect(content.kind).toBe('weekly')
    expect(content.weekLabel).toBe('lun 12 al dom 18 de octubre')
    expect(content.totalArs).toContain('12.000')
    expect(content.comparison).toMatchObject({
      direction: 'up',
      label: '50% vs la semana anterior',
    })
    expect(content.methods.find((m) => m.label === 'Efectivo')?.amountArs).toContain('9.000')
    expect(content.methods.find((m) => m.label === 'Transferencia')?.amountArs).toContain('3.000')
  }, 30_000)

  it('si el barrido vuelve a correr el mismo lunes, no encola la semana dos veces', async () => {
    const { tenant } = await seedWeeklyTenant(true)

    await runSweepAt(MONDAY_8AM_ART)
    await runSweepAt(MONDAY_8AM_ART)

    expect(await weeklyNotifications(tenant.id)).toHaveLength(1)
  }, 30_000)

  it('una semana en $ 0 no manda mail, aunque la anterior haya tenido plata', async () => {
    const { tenant } = await seedWeeklyTenant(true, OUTSIDE_FLOWS)
    await runSweepAt(MONDAY_8AM_ART)
    expect(await weeklyNotifications(tenant.id)).toHaveLength(0)
  }, 30_000)

  it('otro día de la semana no encola nada', async () => {
    const { tenant } = await seedWeeklyTenant(true)
    await runSweepAt(TUESDAY_8AM_ART)
    expect(await weeklyNotifications(tenant.id)).toHaveLength(0)
  }, 30_000)

  it('sin el opt-in no encola nada, aunque sea lunes', async () => {
    const { tenant } = await seedWeeklyTenant(false)
    await runSweepAt(MONDAY_8AM_ART)
    expect(await weeklyNotifications(tenant.id)).toHaveLength(0)
  }, 30_000)
})
