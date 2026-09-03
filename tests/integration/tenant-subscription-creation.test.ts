import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { createTenantWithTrial } from '@/modules/tenants/tenant.service'
import { cleanupAll, createTestStaffUser, ensureRoles } from '../helpers/tenant'

/** Días entre ahora y un timestamp que puede llegar como Date o como string
 *  (el driver lo devuelve distinto según la columna). */
function daysFromNow(value: Date | string): number {
  const ts = new Date(value as unknown as string).getTime()
  return (ts - Date.now()) / (24 * 60 * 60 * 1000)
}

// Bug raíz confirmado: createTenantWithTrial nunca insertaba una fila en
// tenant_subscriptions, así que subscribe() tiraba SubscriptionNotFoundError
// para todo tenant nuevo y ningún complejo podía pagar. Este test cubre el fix.
describe('createTenantWithTrial — siembra tenant_subscriptions', () => {
  beforeAll(async () => {
    await ensureRoles()
  }, 30_000)

  afterEach(async () => {
    await cleanupAll()
  })

  afterAll(async () => {
    await closeSql()
  })

  it('crea una fila trialing con el plan predio y period_end = trial_ends_at', async () => {
    const sql = getSql()
    const staff = await createTestStaffUser(sql)

    const tenant = await createTenantWithTrial({
      name: 'Complejo Test',
      address: 'Calle 123',
      city: 'CABA',
      province: 'Buenos Aires',
      phone: '1122334455',
      email: 'complejo-test@test.local',
      staffUserId: staff.id,
    })

    const subRows = await sql<
      {
        status: string
        billing_cycle: string
        plan_slug: string
        current_period_start: Date | string
        current_period_end: Date | string
      }[]
    >`
      SELECT ts.status, ts.billing_cycle, p.slug AS plan_slug,
             ts.current_period_start, ts.current_period_end
      FROM tenant_subscriptions ts
      JOIN plans p ON p.id = ts.plan_id
      WHERE ts.tenant_id = ${tenant.id}
    `
    expect(subRows).toHaveLength(1)
    expect(subRows[0]!.status).toBe('trialing')
    expect(subRows[0]!.billing_cycle).toBe('monthly')
    expect(subRows[0]!.plan_slug).toBe('predio')

    const tenantRows = await sql<{ trial_ends_at: Date | string }[]>`
      SELECT trial_ends_at FROM tenants WHERE id = ${tenant.id}
    `
    const periodEnd = new Date(subRows[0]!.current_period_end as unknown as string)
    const trialEndsAt = new Date(tenantRows[0]!.trial_ends_at as unknown as string)
    expect(periodEnd.toISOString()).toBe(trialEndsAt.toISOString())

    const periodStart = new Date(subRows[0]!.current_period_start as unknown as string)
    expect(periodStart.getTime()).toBeLessThanOrEqual(Date.now())
    expect(periodStart.getTime()).toBeGreaterThan(Date.now() - 60_000)
  })

  it('encola el mail de bienvenida dirigido al dueño, con su nombre de pila', async () => {
    // La plantilla `trial_welcome` existía desde siempre y nadie la encolaba.
    // El destinatario se resuelve leyendo `tenant_staff_members`, así que este
    // test también fija el ORDEN de los inserts: si la bienvenida se encolara
    // antes de crear la fila de staff, no le llegaría a nadie y en silencio.
    const sql = getSql()
    const staff = await createTestStaffUser(sql)
    const staffRows = await sql<{ first_name: string }[]>`
      SELECT first_name FROM staff_users WHERE id = ${staff.id}
    `

    const tenant = await createTenantWithTrial({
      name: 'Complejo Bienvenida',
      address: 'Calle 456',
      city: 'CABA',
      province: 'Buenos Aires',
      phone: '1122334455',
      email: 'bienvenida@test.local',
      staffUserId: staff.id,
    })

    const rows = await sql<
      {
        recipient_type: string
        recipient_id: string
        status: string
        content: Record<string, unknown>
      }[]
    >`
      SELECT recipient_type, recipient_id, status, content
      FROM notifications
      WHERE tenant_id = ${tenant.id} AND template_name = 'trial_welcome'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]!.recipient_type).toBe('tenant_owner')
    expect(rows[0]!.recipient_id).toBe(staff.id)
    // 'queued' es lo que barre el worker send-email cada minuto; no hace falta
    // un dispatch explícito post-commit.
    expect(rows[0]!.status).toBe('queued')
    expect(rows[0]!.content.tenantName).toBe('Complejo Bienvenida')
    expect(rows[0]!.content.ownerName).toBe(staffRows[0]!.first_name)
  })

  // Guardrail del veto de D4 ("no cambiar el lifecycle hasta tener evidencia del
  // caso cero"): el self-signup NO pasa `trialDays`, así que tiene que seguir
  // dando 30. Si alguien mueve TRIAL_DAYS, este test se pone rojo.
  it('sin trialDays usa el default de 30 días y el mail no afirma plazo', async () => {
    const sql = getSql()
    const staff = await createTestStaffUser(sql)

    const tenant = await createTenantWithTrial({
      name: 'Complejo Default',
      address: 'Calle 789',
      city: 'CABA',
      province: 'Buenos Aires',
      phone: '1122334455',
      email: 'default@test.local',
      staffUserId: staff.id,
    })

    const rows = await sql<{ trial_ends_at: Date | string }[]>`
      SELECT trial_ends_at FROM tenants WHERE id = ${tenant.id}
    `
    const days = daysFromNow(rows[0]!.trial_ends_at)
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)

    // Y el mail NO lleva el número: a los pilotos se les extiende el trial desde
    // soporte cuando este mail ya salió, así que afirmar "30 días" acá terminaba
    // contradiciendo lo que el dueño tenía pactado.
    const mailRows = await sql<{ content: Record<string, unknown> }[]>`
      SELECT content FROM notifications
      WHERE tenant_id = ${tenant.id} AND template_name = 'trial_welcome'
    `
    expect(mailRows[0]!.content).not.toHaveProperty('trialDays')
  })

  // El alta asistida del super-admin fija el trial de los pilotos. Los TRES
  // lugares que el cliente puede comparar entre sí — `trial_ends_at`,
  // `current_period_end` y el copy del mail — salen del mismo número.
  it('con trialDays propaga el mismo valor a trial_ends_at, period_end y el mail', async () => {
    const sql = getSql()
    const staff = await createTestStaffUser(sql)

    const tenant = await createTenantWithTrial({
      name: 'Complejo Piloto',
      address: 'Calle 901',
      city: 'CABA',
      province: 'Buenos Aires',
      phone: '1122334455',
      email: 'piloto@test.local',
      staffUserId: staff.id,
      trialDays: 90,
    })

    const tenantRows = await sql<{ trial_ends_at: Date | string }[]>`
      SELECT trial_ends_at FROM tenants WHERE id = ${tenant.id}
    `
    const days = daysFromNow(tenantRows[0]!.trial_ends_at)
    expect(days).toBeGreaterThan(89.9)
    expect(days).toBeLessThan(90.1)

    const subRows = await sql<{ current_period_end: Date | string }[]>`
      SELECT current_period_end FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    expect(new Date(subRows[0]!.current_period_end as unknown as string).toISOString()).toBe(
      new Date(tenantRows[0]!.trial_ends_at as unknown as string).toISOString(),
    )

    const mailRows = await sql<{ content: Record<string, unknown> }[]>`
      SELECT content FROM notifications
      WHERE tenant_id = ${tenant.id} AND template_name = 'trial_welcome'
    `
    expect(mailRows[0]!.content.trialDays).toBe(90)
  })
})
