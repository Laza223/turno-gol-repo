/**
 * Integration test: GET /api/admin/day-total — el "Hoy: $X" del sidebar (B14).
 *
 * Lo que estos casos protegen es el criterio de salida de Fase 1: **fuente única
 * de agregados, el mismo número en toda superficie que lo muestre, verificado
 * con test de consistencia y no a ojo**. El sidebar es la tercera superficie del
 * mismo total (ya estaban `/caja` y la pantalla "Hoy"), así que lo que hay que
 * demostrar no es que el endpoint "devuelve un número", sino que devuelve EL
 * número: el mismo que `getDaySummary`, y calculado con el mismo criterio.
 *
 * El caso decisivo es el de los egresos: con gastos en 0, "lo cobrado" y "el
 * saldo" coinciden, así que cablear el número equivocado pasa desapercibido
 * hasta el primer día que el complejo paga algo.
 *
 * Requiere Supabase corriendo (`supabase start`) con DATABASE_URL.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '@/modules/auth/types'

// Frontera de auth mockeada — tiene que estar hoisteada antes de importar la ruta.
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import type { Sql } from 'postgres'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { GET as dayTotal } from '@/app/api/admin/day-total/route'
import { getDaySummary } from '@/modules/cashflow/cashflow.service'
import { resolveCutoffMins } from '@/modules/tenants/tenant-operating-day'
import { operatingDateOf } from '@/shared/time/operating-day'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const asUser = (user: AuthUser | null) => vi.mocked(extractAuthUser).mockResolvedValue(user)

let tenantId: string
let otherTenantId: string
let adminStaffId: string
let otherAdminStaffId: string
let managerStaffId: string
let inactiveStaffId: string
let registeredBy: string
let otherRegisteredBy: string

const makeStaffUser = (staffUserId: string, forTenant = tenantId): AuthUser => ({
  type: 'staff',
  id: 'auth-uuid-test',
  email: 'staff@test.local',
  staffUserId,
  tenantId: forTenant,
  // El claim `role` del JWT va hardcodeado a 'admin' para todos: si el guard lo
  // creyera, el caso del staff dado de baja no rechazaría a nadie.
  role: 'admin',
})

const request = () =>
  new Request('http://localhost/api/admin/day-total') as unknown as Parameters<typeof dayTotal>[0]

const readBody = async (res: Response): Promise<{ date: string; collectedCents: number }> => {
  const json = (await res.json()) as { data: { date: string; collectedCents: number } }
  return json.data
}

/**
 * Movimiento con `occurred_at = NOW()`. A propósito y no una fecha fija: el
 * endpoint no recibe parámetros —calcula el día operativo él mismo— así que la
 * única forma de sembrar dentro de la ventana que va a mirar, a cualquier hora
 * del día en que corra el test, es "ahora".
 */
async function insertFlow(
  sql: Sql,
  forTenant: string,
  by: string,
  type: 'income' | 'adjustment' | 'expense',
  category: string,
  amount: number,
): Promise<void> {
  await sql`
    INSERT INTO cash_flows (tenant_id, type, category, amount, method, description, registered_by, occurred_at)
    VALUES (${forTenant}, ${type}, ${category}, ${amount}, 'cash', ${`b14 ${type}`}, ${by}, NOW())
  `
}

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)

  const tenant = await createTestTenant(sql)
  tenantId = tenant.id
  const other = await createTestTenant(sql)
  otherTenantId = other.id

  const admin = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenantId, admin.id, 'admin')
  adminStaffId = admin.id
  registeredBy = admin.id

  const manager = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenantId, manager.id, 'manager')
  managerStaffId = manager.id

  const inactive = await createTestStaffUser(sql)
  const memberId = await linkStaffToTenant(sql, tenantId, inactive.id, 'admin')
  await sql`UPDATE tenant_staff_members SET is_active = false WHERE id = ${memberId}`
  inactiveStaffId = inactive.id

  const otherAdmin = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, otherTenantId, otherAdmin.id, 'admin')
  otherAdminStaffId = otherAdmin.id
  otherRegisteredBy = otherAdmin.id
}, 30_000)

afterAll(async () => {
  try {
    await closeSql()
  } catch {
    // best-effort
  }
})

beforeEach(async () => {
  vi.clearAllMocks()
  const sql = getSql()
  await sql`DELETE FROM cash_flows WHERE tenant_id IN (${tenantId}, ${otherTenantId})`
})

describe('GET /api/admin/day-total — el número del sidebar', () => {
  it('devuelve exactamente lo mismo que getDaySummary para el día que el endpoint eligió', async () => {
    const sql = getSql()
    await insertFlow(sql, tenantId, registeredBy, 'income', 'booking', 1_500_000)
    await insertFlow(sql, tenantId, registeredBy, 'adjustment', 'no_show_correction', 40_000)
    await insertFlow(sql, tenantId, registeredBy, 'expense', 'maintenance', 300_000)

    asUser(makeStaffUser(adminStaffId))
    const body = await readBody(await dayTotal(request()))

    // El control: el mismo total, pedido por el otro camino (el que usa /caja).
    const cutoffMins = await withTenantContext(tenantId, (tx) => resolveCutoffMins(tenantId, tx))
    const summary = await withTenantContext(tenantId, (tx) =>
      getDaySummary(tenantId, body.date, cutoffMins, tx),
    )
    expect(body.collectedCents).toBe(summary.collected)
  })

  it('suma los ajustes y NO resta los egresos: es lo cobrado, no el saldo', async () => {
    const sql = getSql()
    await insertFlow(sql, tenantId, registeredBy, 'income', 'booking', 1_000_000)
    await insertFlow(sql, tenantId, registeredBy, 'adjustment', 'no_show_correction', 25_000)
    await insertFlow(sql, tenantId, registeredBy, 'expense', 'maintenance', 900_000)

    asUser(makeStaffUser(adminStaffId))
    const body = await readBody(await dayTotal(request()))

    // 1.025.000 = ingresos + ajustes. El saldo sería 125.000: si alguien
    // cableara `balance`, este es el único caso que lo delata, porque con
    // egresos en 0 los dos números son iguales.
    expect(body.collectedCents).toBe(1_025_000)
  })

  it('la fecha es el día OPERATIVO del complejo, calculada server-side', async () => {
    asUser(makeStaffUser(adminStaffId))
    const body = await readBody(await dayTotal(request()))

    const cutoffMins = await withTenantContext(tenantId, (tx) => resolveCutoffMins(tenantId, tx))
    // El endpoint no recibe fecha ni cutoff: no hay parámetro que pisar para
    // que sume plata de otra ventana.
    expect(body.date).toBe(operatingDateOf(new Date(), cutoffMins))
  })

  it('un día sin movimientos devuelve 0, no un error ni null', async () => {
    asUser(makeStaffUser(adminStaffId))
    const body = await readBody(await dayTotal(request()))
    expect(body.collectedCents).toBe(0)
  })

  it('el encargado lo ve: es el mismo número que ya le muestra /caja', async () => {
    const sql = getSql()
    await insertFlow(sql, tenantId, registeredBy, 'income', 'booking', 700_000)

    asUser(makeStaffUser(managerStaffId))
    const res = await dayTotal(request())
    expect(res.status).toBe(200)
    expect((await readBody(res)).collectedCents).toBe(700_000)
  })

  it('no cuenta la plata de otro complejo', async () => {
    const sql = getSql()
    await insertFlow(sql, tenantId, registeredBy, 'income', 'booking', 100_000)
    await insertFlow(sql, otherTenantId, otherRegisteredBy, 'income', 'booking', 9_999_999)

    asUser(makeStaffUser(adminStaffId))
    expect((await readBody(await dayTotal(request()))).collectedCents).toBe(100_000)

    asUser(makeStaffUser(otherAdminStaffId, otherTenantId))
    expect((await readBody(await dayTotal(request()))).collectedCents).toBe(9_999_999)
  })

  it('rechaza a un miembro de staff dado de baja', async () => {
    const sql = getSql()
    await insertFlow(sql, tenantId, registeredBy, 'income', 'booking', 500_000)

    asUser(makeStaffUser(inactiveStaffId))
    const res = await dayTotal(request())
    expect(res.status).toBe(403)
    expect(await res.text()).not.toContain('500000')
  })

  it('rechaza a un usuario sin sesión', async () => {
    asUser(null)
    expect((await dayTotal(request())).status).toBe(401)
  })
})
