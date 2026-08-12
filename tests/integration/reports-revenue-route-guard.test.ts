/**
 * Integration test: GET /api/reports/revenue (export CSV de cash_flows).
 *
 * B10 🔴 — el endpoint validaba sólo `user.type === 'staff'` + `getStaffTenant`:
 * no revalidaba el rol contra `tenant_staff_members` (un staff dado de baja
 * seguía exportando con su JWT viejo) ni miraba el lifecycle del tenant (un
 * complejo `blocked`/`suspended`/`churned` exportaba todos sus movimientos,
 * cuando el layout `(admin)` ya lo tenía hard-lockeado por pantalla).
 *
 * Los 3 primeros casos son el control negativo del fix: en `main@27dd8348`
 * devolvían 200 con el CSV completo.
 *
 * Requires a running Supabase instance (`supabase start`) con DATABASE_URL.
 * Falla si la DB no está disponible: sin base no hay señal que dar.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '@/modules/auth/types'

// Auth boundary mock — must be hoisted before route import.
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { closeSql, getSql } from '@/shared/db/client'
import { GET as exportRevenue } from '@/app/api/reports/revenue/route'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const asUser = (user: AuthUser | null) => vi.mocked(extractAuthUser).mockResolvedValue(user)

let tenantId: string
let adminStaffId: string
let managerStaffId: string
let inactiveStaffId: string

const CSV_URL = 'http://localhost/api/reports/revenue?from=2026-05-01&to=2026-05-31&format=csv'

const makeStaffUser = (staffUserId: string): AuthUser => ({
  type: 'staff',
  id: 'auth-uuid-test',
  email: 'staff@test.local',
  staffUserId,
  // El claim `role` del JWT viene hardcodeado a 'admin' para todo el staff:
  // si el guard lo creyera, ninguno de estos casos rechazaría a nadie.
  tenantId,
  role: 'admin',
})

// `withTenant` recibe un NextRequest; para lo que usa el handler (req.url,
// req.method) un Request estándar es estructuralmente compatible.
const csvRequest = () => new Request(CSV_URL) as unknown as Parameters<typeof exportRevenue>[0]

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)

  const tenant = await createTestTenant(sql)
  tenantId = tenant.id

  const admin = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, admin.id, 'admin')
  adminStaffId = admin.id

  const manager = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, manager.id, 'manager')
  managerStaffId = manager.id

  // Miembro dado de baja: la fila existe pero `is_active = false`.
  const inactive = await createTestStaffUser(sql)
  const memberId = await linkStaffToTenant(sql, tenant.id, inactive.id, 'admin')
  await sql`UPDATE tenant_staff_members SET is_active = false WHERE id = ${memberId}`
  inactiveStaffId = inactive.id
}, 30_000)

afterAll(async () => {
  try {
    const sql = getSql()
    await sql`UPDATE tenants SET status = 'active' WHERE id = ${tenantId}`
    await closeSql()
  } catch {
    // best-effort cleanup
  }
})

beforeEach(async () => {
  vi.clearAllMocks()
  const sql = getSql()
  await sql`UPDATE tenants SET status = 'active' WHERE id = ${tenantId}`
})

describe('GET /api/reports/revenue — guard de rol + lifecycle (B10)', () => {
  it('rechaza a un miembro de staff desactivado (is_active=false)', async () => {
    asUser(makeStaffUser(inactiveStaffId))
    const res = await exportRevenue(csvRequest())
    expect(res.status).toBe(403)
    expect(await res.text()).not.toContain('fecha,tipo')
  })

  it.each(['blocked', 'churned', 'deleted'])(
    'rechaza el export con el complejo en estado %s',
    async (status) => {
      const sql = getSql()
      await sql`UPDATE tenants SET status = ${status} WHERE id = ${tenantId}`
      asUser(makeStaffUser(adminStaffId))
      const res = await exportRevenue(csvRequest())
      expect(res.status).toBe(403)
      expect(await res.text()).not.toContain('fecha,tipo')
    },
  )

  it('rechaza a un usuario sin sesión', async () => {
    asUser(null)
    const res = await exportRevenue(csvRequest())
    expect(res.status).toBe(401)
  })

  it('deja exportar al admin del complejo activo', async () => {
    asUser(makeStaffUser(adminStaffId))
    const res = await exportRevenue(csvRequest())
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
  })

  it('deja exportar al encargado: es la misma superficie que /analiticas', async () => {
    asUser(makeStaffUser(managerStaffId))
    const res = await exportRevenue(csvRequest())
    expect(res.status).toBe(200)
  })

  it('sigue rechazando un rango de fechas inválido', async () => {
    asUser(makeStaffUser(adminStaffId))
    const bad = new Request(
      'http://localhost/api/reports/revenue?from=nope&to=2026-05-31&format=csv',
    ) as unknown as Parameters<typeof exportRevenue>[0]
    const res = await exportRevenue(bad)
    expect(res.status).toBe(400)
  })

  /**
   * B10 — `getCashFlowsForExport` no tiene `LIMIT` y está BIEN que no lo tenga:
   * un export de plata truncado en silencio es peor que uno que falla, porque
   * el complejo cierra su contabilidad con un CSV al que le faltan filas. Pero
   * sin techo de rango, un `?from=1900-01-01` trae TODOS los movimientos a
   * memoria dentro de una función serverless. Se rechaza el pedido, no se
   * recorta el resultado.
   */
  describe('techo del rango', () => {
    const rango = (from: string, to: string) =>
      new Request(
        `http://localhost/api/reports/revenue?from=${from}&to=${to}&format=csv`,
      ) as unknown as Parameters<typeof exportRevenue>[0]

    it('rechaza un rango absurdo con 400, sin devolver medio CSV', async () => {
      asUser(makeStaffUser(adminStaffId))
      const res = await exportRevenue(rango('1900-01-01', '2999-12-31'))
      expect(res.status).toBe(400)
      expect(await res.text()).not.toContain('fecha,tipo')
    })

    it('rechaza "hasta" anterior a "desde"', async () => {
      asUser(makeStaffUser(adminStaffId))
      const res = await exportRevenue(rango('2026-05-31', '2026-05-01'))
      expect(res.status).toBe(400)
    })

    it('un año completo sigue entrando (es el caso real de cierre anual)', async () => {
      asUser(makeStaffUser(adminStaffId))
      const res = await exportRevenue(rango('2026-01-01', '2026-12-31'))
      expect(res.status).toBe(200)
    })

    it('un día solo también', async () => {
      // Control del borde inferior: `spanDays` es inclusivo, así que from==to
      // vale 1 y no 0.
      asUser(makeStaffUser(adminStaffId))
      const res = await exportRevenue(rango('2026-05-10', '2026-05-10'))
      expect(res.status).toBe(200)
    })
  })
})
