import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { createTenantWithTrial } from '@/modules/tenants/tenant.service'
import { cleanupAll, createTestStaffUser, ensureRoles } from '../helpers/tenant'

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
      { recipient_type: string; recipient_id: string; status: string; content: Record<string, unknown> }[]
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
})
