import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { addDays, addMonths } from 'date-fns'
import { closeSql, getSql } from '@/shared/db/client'
import { listTenants } from '@/modules/super-admin/tenants.service'
import { getDashboardData } from '@/modules/super-admin/dashboard.service'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

/**
 * F6 (revisión Plus): el MRR del super-admin (lista y dashboard) incluye Plus.
 * Montos a mano: plan $30.000 por cancha, Plus de lista $15.000, anual 10% sobre
 * la suma, 5 canchas.
 */

const NOW = new Date('2027-03-10T12:00:00Z')
const sql = getSql()

async function seedActive(
  name: string,
  opts: {
    cycle?: 'monthly' | 'annual'
    plusEnabled?: boolean
    plusPrice?: number | null
    status?: string
  } = {},
): Promise<string> {
  const tenant = await createTestTenant(sql, { name })
  const plan = await sql<{ id: string }[]>`
    SELECT id FROM plans WHERE is_active = true ORDER BY sort_order LIMIT 1
  `
  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, billed_courts, status,
      current_period_start, current_period_end, plus_enabled, plus_price_per_court_cents
    ) VALUES (
      ${tenant.id}, ${plan[0]!.id}, ${opts.cycle ?? 'monthly'}::billing_cycle, 5,
      ${opts.status ?? 'active'}::subscription_status,
      ${addMonths(NOW, -1).toISOString()}::timestamptz, ${addDays(NOW, 20).toISOString()}::timestamptz,
      ${opts.plusEnabled ?? false}, ${opts.plusPrice ?? null}
    )
  `
  return tenant.id
}

beforeEach(async () => {
  await ensureRoles(sql)
  await cleanupAll(sql)
})

afterAll(async () => {
  await cleanupAll(sql)
  await closeSql()
})

async function mrrOf(tenantId: string): Promise<number | undefined> {
  const list = await listTenants({ page: 1, pageSize: 50 })
  return list.rows.find((r) => r.id === tenantId)?.mrrCents
}

describe('MRR del super-admin con Plus (F6)', () => {
  it('lista: sin Plus da igual que antes; con Plus de lista o especial lo suma; anual descuenta la suma', async () => {
    const sin = await seedActive('Sin Plus')
    const lista = await seedActive('Plus lista', { plusEnabled: true })
    const especial = await seedActive('Plus especial', { plusEnabled: true, plusPrice: 1_200_000 })
    const anual = await seedActive('Plus anual', { cycle: 'annual', plusEnabled: true })
    const anualSin = await seedActive('Anual sin Plus', { cycle: 'annual' })
    // Baja agendada: el débito ya no lo lleva (plus_enabled = false) aunque haya precio cargado.
    const baja = await seedActive('Baja agendada', { plusPrice: 1_200_000 })

    expect(await mrrOf(sin)).toBe(15_000_000) // 5 x 30.000
    expect(await mrrOf(lista)).toBe(22_500_000) // 5 x (30.000 + 15.000)
    expect(await mrrOf(especial)).toBe(21_000_000) // 5 x (30.000 + 12.000)
    expect(await mrrOf(anual)).toBe(20_250_000) // 225.000 x 0,9
    expect(await mrrOf(anualSin)).toBe(13_500_000) // 150.000 x 0,9
    expect(await mrrOf(baja)).toBe(15_000_000)
  })

  it('dashboard: el MRR suma el Plus de los complejos activos', async () => {
    await seedActive('Sin Plus')
    await seedActive('Plus lista', { plusEnabled: true })
    await seedActive('Plus anual', { cycle: 'annual', plusEnabled: true })
    // No activo: no cuenta.
    await seedActive('Past due', { plusEnabled: true, status: 'past_due' })

    const data = await getDashboardData()

    // 15.000.00 + 22.500.00 + 20.250.00 centavos
    expect(data.mrrCents).toBe(57_750_000)
  })
})
