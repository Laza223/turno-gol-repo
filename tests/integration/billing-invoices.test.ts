/**
 * Integration test: historial de pagos SaaS (doc15 §5.8, `GET
 * /api/billing/invoices`) — el gap cerrado en `docs/audit/DOC_DRIFT_2026-08-27.md`
 * ítem #16.
 *
 * No hay tabla local de facturas: `listInvoices` lee EN VIVO de MercadoPago vía
 * `searchPaymentsByReference(tenantId)` (ver el comentario de `InvoiceEntry` en
 * `billing.types.ts`), así que estos tests fijan la respuesta del `MockGateway`
 * en vez de sembrar filas — lo que se está probando es el mapeo y el aislamiento
 * por rol/tenant, no una query SQL.
 *
 * Requiere Supabase corriendo (`supabase start`) con DATABASE_URL.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '@/modules/auth/types'

// Frontera de auth mockeada — tiene que estar hoisteada antes de importar la ruta
// (mismo patrón que admin-day-total-endpoint.test.ts).
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { closeSql, getSql } from '@/shared/db/client'
import { GET as invoicesRoute } from '@/app/api/billing/invoices/route'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { setBillingGateway } from '@/modules/billing/billing.gateway'
import { listInvoices } from '@/modules/billing/billing.service'
import type { GatewayPaymentInfo } from '@/modules/payments/payment.types'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const asUser = (user: AuthUser | null) => vi.mocked(extractAuthUser).mockResolvedValue(user)

const makeStaffUser = (staffUserId: string, tenantId: string): AuthUser => ({
  type: 'staff',
  id: 'auth-uuid-test',
  email: 'staff@test.local',
  staffUserId,
  tenantId,
  // El claim `role` del JWT va hardcodeado: el guard real lee de la DB
  // (getStaffRole), así que esto no debe importar para el resultado del test.
  role: 'admin',
})

const request = () =>
  new Request('http://localhost/api/billing/invoices') as unknown as Parameters<
    typeof invoicesRoute
  >[0]

let mockGateway: MockGateway

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

beforeEach(() => {
  mockGateway = new MockGateway()
  setBillingGateway(mockGateway)
})

afterEach(async () => {
  setBillingGateway(null)
  vi.mocked(extractAuthUser).mockReset()
  const sql = getSql()
  await sql`TRUNCATE TABLE tenant_staff_members, tenants, staff_users RESTART IDENTITY CASCADE`
})

const APPROVED: GatewayPaymentInfo = {
  mpPaymentId: 'mp-pay-1',
  status: 'approved',
  amount: 8_500_000,
  externalReference: 'placeholder',
  paymentMethodId: 'account_money',
  dateCreated: '2027-05-01T10:00:00.000-03:00',
}

const REJECTED: GatewayPaymentInfo = {
  mpPaymentId: 'mp-pay-2',
  status: 'rejected',
  amount: 8_500_000,
  externalReference: 'placeholder',
  paymentMethodId: 'credit_card',
  // Sin dateCreated: cubre el caso "MP no lo mandó" → date: null, no un throw.
}

describe('listInvoices (service)', () => {
  it('mapea los pagos que MP devuelve para la referencia del tenant', async () => {
    mockGateway.searchResults['tenant-x'] = [APPROVED, REJECTED]

    const invoices = await listInvoices('tenant-x', mockGateway)

    expect(mockGateway.searchCalls).toEqual(['tenant-x'])
    expect(invoices).toEqual([
      {
        mpPaymentId: 'mp-pay-1',
        status: 'approved',
        amount: 8_500_000,
        date: new Date(APPROVED.dateCreated!),
      },
      { mpPaymentId: 'mp-pay-2', status: 'rejected', amount: 8_500_000, date: null },
    ])
  })

  it('sin pagos sembrados, devuelve [] en vez de tirar (tenant nunca pagó)', async () => {
    const invoices = await listInvoices('tenant-nuevo-sin-pagos', mockGateway)
    expect(invoices).toEqual([])
  })
})

describe('GET /api/billing/invoices (route)', () => {
  it('devuelve el historial del tenant del staff autenticado — solo el suyo', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    const tenantB = await createTestTenant(sql)
    const adminA = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenantA.id, adminA.id, 'admin')

    // Sembrado bajo el id de CADA tenant: si el handler alguna vez mezclara
    // `user.tenantId` con otro valor, este test lo vería como una lista vacía
    // o con los pagos equivocados, no como un 500 — el caso más peligroso.
    mockGateway.searchResults[tenantA.id] = [APPROVED]
    mockGateway.searchResults[tenantB.id] = [REJECTED]

    asUser(makeStaffUser(adminA.id, tenantA.id))

    const res = await invoicesRoute(request())
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: Array<{ mpPaymentId: string }> }
    expect(json.data).toHaveLength(1)
    expect(json.data[0]!.mpPaymentId).toBe('mp-pay-1')
    expect(mockGateway.searchCalls).toEqual([tenantA.id])
  })

  it('rebota al manager (Encargado): la facturación es solo-admin (doc15 §5.8)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const manager = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, manager.id, 'manager')

    asUser(makeStaffUser(manager.id, tenant.id))

    const res = await invoicesRoute(request())
    expect(res.status).toBe(403)
  })

  it('sin sesión, 401', async () => {
    asUser(null)
    const res = await invoicesRoute(request())
    expect(res.status).toBe(401)
  })
})
