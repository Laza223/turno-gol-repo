import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { TenantRow } from '@/modules/tenants/tenant.types'

// Decisión del dueño 2026-10-22: en solo lectura (`suspended`) el complejo
// puede marcar como hecha una devolución pendiente (la seña de un jugador que
// canceló) y nada más de caja. Se prueba con el guard REAL y el boundary
// mockeado (mismo patrón que staff-guards-tenant-lifecycle.test.ts): lo que
// importa es qué hace el gate con cada acción, no qué le pasa el mock.
const READ_ONLY_ERROR =
  'El complejo está en solo lectura: podés ver todo, pero no cargar ni cambiar nada hasta que se active el plan.'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/auth/impersonation.server', () => ({ getImpersonationSession: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(async (_id: string, cb: (tx: unknown) => unknown) => cb({})),
}))
vi.mock('@/modules/payments/refund.service', () => ({ markRefundSettled: vi.fn() }))
vi.mock('@/modules/cashflow/cashflow.service', () => ({ createCashFlow: vi.fn() }))
vi.mock('@/modules/canteen/canteen-sale.service', () => ({ sellTicket: vi.fn() }))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { markRefundSettled } from '@/modules/payments/refund.service'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { sellTicket } from '@/modules/canteen/canteen-sale.service'
import { markRefundSettledAction } from '@/app/(admin)/caja/devoluciones/actions'
import { createCashFlowAction } from '@/app/(admin)/caja/actions'
import { sellTicketAction } from '@/app/(admin)/caja/cantina/actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const STAFF_USER_ID = '22222222-2222-4222-8222-222222222222'
const REFUND_ID = '33333333-3333-4333-8333-333333333333'
const BOOKING_ID = '44444444-4444-4444-8444-444444444444'
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555'
const IDEMPOTENCY_KEY = '66666666-6666-4666-8666-666666666666'

function tenantRow(status: TenantRow['status']): TenantRow {
  return {
    id: TENANT_ID,
    slug: 'demo-fc',
    name: 'Demo FC',
    description: null,
    logoUrl: null,
    coverUrl: null,
    address: 'Calle Falsa 123',
    city: 'CABA',
    province: 'Buenos Aires',
    phone: '1122334455',
    whatsapp: null,
    email: 'demo@turnogol.app',
    status,
    trialEndsAt: null,
    settings: {} as TenantRow['settings'],
    openingHours: {} as TenantRow['openingHours'],
    closedDates: null,
    closesNextDay: false,
    mpConnectedAt: null,
    mpNickname: null,
    mpDisconnectedAt: null,
    latitude: null,
    longitude: null,
  }
}

function setTenant(status: TenantRow['status'], role: 'admin' | 'manager' = 'manager') {
  vi.mocked(extractAuthUser).mockResolvedValue({
    type: 'staff',
    id: 'auth-1',
    email: 'staff@test.local',
    staffUserId: STAFF_USER_ID,
    tenantId: TENANT_ID,
    role,
  })
  vi.mocked(getStaffRole).mockResolvedValue(role)
  vi.mocked(getStaffTenant).mockResolvedValue(tenantRow(status))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getImpersonationSession).mockResolvedValue(null)
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
  vi.mocked(markRefundSettled).mockResolvedValue({
    refundPaymentId: REFUND_ID,
    bookingId: BOOKING_ID,
    amountCents: 500_000,
  })
})

describe('caja en solo lectura (suspended)', () => {
  it.each(['admin', 'manager'] as const)(
    'el %s marca la devolución como hecha y queda el egreso',
    async (role) => {
      setTenant('suspended', role)

      expect(await markRefundSettledAction(REFUND_ID, 'cash')).toEqual({ success: true })
      expect(markRefundSettled).toHaveBeenCalledWith(
        expect.objectContaining({ refundPaymentId: REFUND_ID, tenantId: TENANT_ID }),
        expect.anything(),
      )
      // La seña había entrado como ingreso: sin el egreso, la caja queda inflada.
      expect(createCashFlow).toHaveBeenCalledWith(
        TENANT_ID,
        STAFF_USER_ID,
        expect.objectContaining({ type: 'expense', method: 'cash', amount: 500_000 }),
        expect.anything(),
      )
    },
  )

  it('cargar un movimiento sigue rechazado', async () => {
    setTenant('suspended')
    const res = await createCashFlowAction({
      type: 'expense',
      category: 'other_expense',
      amount: 100_000,
      method: 'cash',
      description: 'Bidón de agua',
    })
    expect(res).toEqual({ success: false, error: READ_ONLY_ERROR })
    expect(createCashFlow).not.toHaveBeenCalled()
  })

  it('vender en la cantina sigue rechazado', async () => {
    setTenant('suspended')
    const res = await sellTicketAction({
      lines: [{ productId: PRODUCT_ID, qty: 1 }],
      method: 'cash',
      clientIdempotencyKey: IDEMPOTENCY_KEY,
    })
    expect(res).toEqual({ success: false, error: READ_ONLY_ERROR })
    expect(sellTicket).not.toHaveBeenCalled()
  })

  it.each(['blocked', 'churned', 'deleted'] as const)(
    'con el complejo %s la devolución tampoco pasa',
    async (status) => {
      setTenant(status)
      const res = await markRefundSettledAction(REFUND_ID, 'cash')
      expect(res.success).toBe(false)
      expect(markRefundSettled).not.toHaveBeenCalled()
      expect(createCashFlow).not.toHaveBeenCalled()
    },
  )
})

// `allowReadOnly` en una Server Action deja escribir (o leer) a un complejo que
// no pagó. Es opt-in, y la lista de quién lo pide es cerrada: una acción nueva
// que lo pida tiene que pasar por una decisión del dueño y sumarse acá.
const ACCIONES_EN_SOLO_LECTURA = [
  // Exportar sus datos (#476): solo lee.
  'src/app/(admin)/settings/datos/actions.ts',
  // Marcar una devolución como hecha: la única escritura (decisión 2026-10-22).
  'src/app/(admin)/caja/devoluciones/actions.ts',
]

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

describe('acciones que andan en solo lectura', () => {
  it('solo las de la lista piden allowReadOnly', () => {
    const root = process.cwd()
    const conAllowReadOnly = filesUnder(join(root, 'src'))
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => {
        const source = readFileSync(f, 'utf8')
        return /^\s*['"]use server['"]/.test(source) && /allowReadOnly:\s*true/.test(source)
      })
      .map((f) => relative(root, f).split(sep).join('/'))
      .sort()
    expect(conAllowReadOnly).toEqual([...ACCIONES_EN_SOLO_LECTURA].sort())
  })
})
