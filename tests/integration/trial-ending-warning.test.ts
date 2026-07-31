/**
 * Aviso de fin de prueba (migr. 068).
 *
 * Antes, la prueba vencía y `expire-trials` mandaba el complejo a `blocked`
 * DIRECTO: las plantillas `trial_ending`/`trial_welcome` existían pero ningún
 * `enqueueNotification` las referenciaba, así que el dueño se despertaba con el
 * complejo apagado sin haber recibido nada.
 *
 * Lo que más importa acá es la IDEMPOTENCIA. En el sweep de dunning sale gratis
 * de la máquina de estados (la notificación va adentro de una transición que
 * ocurre una sola vez); acá el complejo sigue en `trialing` antes y después de
 * avisarle, así que sin el gate de `trial_warning_days_sent` el cron diario le
 * mandaría el mismo mail TODOS los días hasta que venza.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { runExpireTrials } from '@/shared/jobs/workers/expire-trials.worker'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import type { Sql } from 'postgres'

async function loadPredioPlanId(sql: Sql): Promise<string> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM plans WHERE slug = 'predio' LIMIT 1`
  return rows[0]!.id
}

/** Complejo en prueba con dueño activo (el aviso se dirige a `tenant_staff_members`). */
async function seedTrialing(
  sql: Sql,
  planId: string,
  trialEndsAt: Date,
): Promise<{ id: string }> {
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  await sql`
    UPDATE tenants SET trial_ends_at = ${trialEndsAt.toISOString()}::timestamptz
    WHERE id = ${tenant.id}
  `
  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, status, current_period_start, current_period_end
    ) VALUES (
      ${tenant.id}, ${planId}, 'monthly'::billing_cycle, 'trialing'::subscription_status,
      NOW() - INTERVAL '23 days', ${trialEndsAt.toISOString()}::timestamptz
    )
  `
  return { id: tenant.id }
}

function inDays(n: number): Date {
  return new Date(Date.now() + n * 86_400_000)
}

async function warnings(sql: Sql, tenantId: string) {
  return sql<{ content: Record<string, unknown> }[]>`
    SELECT content FROM notifications
    WHERE tenant_id = ${tenantId} AND template_name = 'trial_ending'
    ORDER BY created_at
  `
}

async function warnedThreshold(sql: Sql, tenantId: string): Promise<number | null> {
  const rows = await sql<{ v: number | null }[]>`
    SELECT trial_warning_days_sent AS v FROM tenants WHERE id = ${tenantId}
  `
  return rows[0]!.v
}

let planId: string

beforeAll(async () => {
  const s = getSql()
  await ensureRoles(s)
  await cleanupAll(s)
  planId = await loadPredioPlanId(s)
}, 30_000)

afterEach(async () => {
  await cleanupAll(getSql())
})

afterAll(async () => closeSql())

describe('aviso de fin de prueba', () => {
  it('a 5 días encola UN trial_ending y marca el umbral de 7', async () => {
    const s = getSql()
    const tenant = await seedTrialing(s, planId, inDays(5))

    await runExpireTrials()

    const rows = await warnings(s, tenant.id)
    expect(rows).toHaveLength(1)
    // Los días del mail salen del tiempo REAL restante, no del umbral: si una
    // corrida se saltea, el dueño no lee un número falso.
    expect(rows[0]!.content.daysLeft).toBe(5)
    expect(await warnedThreshold(s, tenant.id)).toBe(7)
  })

  it('correrlo de nuevo NO reenvía: es lo único que separa un aviso de spam diario', async () => {
    const s = getSql()
    const tenant = await seedTrialing(s, planId, inDays(5))

    await runExpireTrials()
    await runExpireTrials()
    await runExpireTrials()

    expect(await warnings(s, tenant.id)).toHaveLength(1)
  })

  it('cruzar al último tramo dispara el 2do aviso, con el umbral de 1', async () => {
    const s = getSql()
    const tenant = await seedTrialing(s, planId, inDays(5))
    await runExpireTrials()

    // El tiempo pasa: ahora le queda menos de un día.
    await s`
      UPDATE tenants SET trial_ends_at = NOW() + INTERVAL '10 hours' WHERE id = ${tenant.id}
    `
    await runExpireTrials()

    const rows = await warnings(s, tenant.id)
    expect(rows).toHaveLength(2)
    expect(await warnedThreshold(s, tenant.id)).toBe(1)
    // Nunca menos de 1: "te quedan 0 días" no le sirve a nadie.
    expect(rows[1]!.content.daysLeft).toBe(1)
  })

  it('con menos de un día y sin avisos previos usa el umbral 1, no el 7', async () => {
    // Regresión del bug que tuvo esta implementación: recorriendo los umbrales
    // de mayor a menor, 10 horas ≤ 7 días da verdadero y el complejo quedaba
    // marcado como avisado en 7 — el último llamado no llegaba nunca.
    const s = getSql()
    const tenant = await seedTrialing(s, planId, new Date(Date.now() + 10 * 3_600_000))

    await runExpireTrials()

    expect(await warnedThreshold(s, tenant.id)).toBe(1)
    expect(await warnings(s, tenant.id)).toHaveLength(1)
  })

  it('lejos del vencimiento no avisa nada todavía', async () => {
    const s = getSql()
    const tenant = await seedTrialing(s, planId, inDays(20))

    await runExpireTrials()

    expect(await warnings(s, tenant.id)).toHaveLength(0)
    expect(await warnedThreshold(s, tenant.id)).toBeNull()
  })

  it('al ya vencido no le avisa: lo expira, que es lo que corresponde', async () => {
    const s = getSql()
    const tenant = await seedTrialing(s, planId, inDays(-1))

    await runExpireTrials()

    expect(await warnings(s, tenant.id)).toHaveLength(0)
    const rows = await s<{ status: string }[]>`SELECT status FROM tenants WHERE id = ${tenant.id}`
    expect(rows[0]!.status).toBe('blocked')
  })

  it('avisar no toca el estado: el complejo sigue operando hasta que venza', async () => {
    // Control positivo del test de arriba: la fase de aviso no debe adelantar
    // el bloqueo ni un día.
    const s = getSql()
    const tenant = await seedTrialing(s, planId, inDays(3))

    await runExpireTrials()

    const rows = await s<{ status: string }[]>`SELECT status FROM tenants WHERE id = ${tenant.id}`
    expect(rows[0]!.status).toBe('trialing')
  })
})
