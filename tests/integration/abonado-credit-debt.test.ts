import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { registerDebtPayment } from '@/modules/relationships/ptr.service'
import { NoDebtError, DebtOverpaymentError } from '@/modules/relationships/ptr.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
  linkStaffToTenant,
} from '../helpers/tenant'

async function readBalance(tenantId: string, playerId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ balance: number }[]>`
    SELECT balance FROM player_tenant_relationships WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
  `
  return Number(rows[0]!.balance)
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('Tarea #9 — Cobro de deuda del jugador', () => {
  it('reduce el balance deudor y registra un CashFlow income', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await linkPlayerToTenant(sql, tenant.id, player.id)
    await sql`UPDATE player_tenant_relationships SET balance = ${55_000_00} WHERE tenant_id = ${tenant.id} AND player_id = ${player.id}`

    const res = await withTenantContext(tenant.id, (tx) =>
      registerDebtPayment(tenant.id, staff.id, { playerId: player.id, amount: 20_000_00, method: 'cash' }, tx),
    )
    expect(res.newBalance).toBe(35_000_00)
    expect(res.cashFlow.type).toBe('income')
    expect(res.cashFlow.amount).toBe(20_000_00)
    expect(await readBalance(tenant.id, player.id)).toBe(35_000_00)

    // Pago total restante → balance 0.
    const res2 = await withTenantContext(tenant.id, (tx) =>
      registerDebtPayment(tenant.id, staff.id, { playerId: player.id, amount: 35_000_00, method: 'transfer' }, tx),
    )
    expect(res2.newBalance).toBe(0)
  })

  it('idempotencia: la misma clave no descuenta el balance dos veces', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await linkPlayerToTenant(sql, tenant.id, player.id)
    await sql`UPDATE player_tenant_relationships SET balance = ${50_000_00} WHERE tenant_id = ${tenant.id} AND player_id = ${player.id}`

    const key = '22222222-2222-4222-8222-222222222222'
    await withTenantContext(tenant.id, (tx) =>
      registerDebtPayment(tenant.id, staff.id, { playerId: player.id, amount: 20_000_00, method: 'cash', clientIdempotencyKey: key }, tx),
    )
    const second = await withTenantContext(tenant.id, (tx) =>
      registerDebtPayment(tenant.id, staff.id, { playerId: player.id, amount: 20_000_00, method: 'cash', clientIdempotencyKey: key }, tx),
    )
    expect(second.newBalance).toBe(30_000_00)
    expect(await readBalance(tenant.id, player.id)).toBe(30_000_00)
  })

  it('rechaza pago que supera la deuda', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await linkPlayerToTenant(sql, tenant.id, player.id)
    await sql`UPDATE player_tenant_relationships SET balance = ${10_000_00} WHERE tenant_id = ${tenant.id} AND player_id = ${player.id}`

    await expect(
      withTenantContext(tenant.id, (tx) =>
        registerDebtPayment(tenant.id, staff.id, { playerId: player.id, amount: 20_000_00, method: 'cash' }, tx),
      ),
    ).rejects.toBeInstanceOf(DebtOverpaymentError)
  })

  it('rechaza cobro si el jugador no tiene deuda', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await linkPlayerToTenant(sql, tenant.id, player.id) // balance default 0

    await expect(
      withTenantContext(tenant.id, (tx) =>
        registerDebtPayment(tenant.id, staff.id, { playerId: player.id, amount: 5_000_00, method: 'cash' }, tx),
      ),
    ).rejects.toBeInstanceOf(NoDebtError)
  })
})
