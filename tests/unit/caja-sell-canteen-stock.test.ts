import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regresión (hallazgo del verificador adversarial): en sellCanteenProductAction
// el chequeo de stock corría ANTES que el de idempotencia, así que un reintento
// con la MISMA clientIdempotencyKey tras agotar el stock devolvía un falso "sin
// stock" sobre una venta YA registrada. El fix invierte el orden: duplicado
// primero (mismo criterio que addBookingChargeAction). Este test lo blinda.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn(), getDb: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/modules/cashflow/cashflow.service', () => ({ createCashFlow: vi.fn() }))
vi.mock('@/modules/cashflow/daily-close.service', () => ({ closeDailyRegister: vi.fn() }))

import { sellCanteenProductAction } from '@/app/(admin)/caja/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'

const KEY = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const PRODUCT_ID = 'prod-agua'

function makeTx({ stock, dupExists }: { stock?: number; dupExists: boolean }) {
  const product = {
    id: PRODUCT_ID,
    name: 'Agua',
    price: 150000,
    ...(stock === undefined ? {} : { stock }),
  }
  const settings = { canteen_products: [product] }
  const whereMock = vi.fn().mockResolvedValue(undefined)
  const setMock = vi.fn(() => ({ where: whereMock }))
  const updateMock = vi.fn(() => ({ set: setMock }))
  const execute = vi
    .fn()
    .mockResolvedValueOnce([{ settings }]) // 1) SELECT settings FROM tenants ... FOR UPDATE
    .mockResolvedValueOnce(dupExists ? [{ ok: 1 }] : []) // 2) SELECT 1 FROM cash_flows WHERE client_idempotency_key
  return { tx: { execute, update: updateMock }, updateMock }
}

function wireTx(tx: unknown) {
  vi.mocked(withTenantContext).mockImplementation(
    (async (_id: string, cb: (t: never) => Promise<unknown>) => cb(tx as never)) as never,
  )
}

function input(over: { qty?: number } = {}) {
  return {
    productId: PRODUCT_ID,
    qty: over.qty ?? 1,
    method: 'cash' as const,
    clientIdempotencyKey: KEY,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue({
    type: 'staff',
    staffUserId: 'staff-1',
    role: 'admin',
  } as never)
  vi.mocked(getStaffTenant).mockResolvedValue({ id: 'tenant-1', settings: {} } as never)
  vi.mocked(getStaffRole).mockResolvedValue('manager')
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
  vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-1' } as never)
})

describe('sellCanteenProductAction — stock + idempotencia', () => {
  it('venta normal: descuenta stock y registra el cash_flow', async () => {
    const { tx, updateMock } = makeTx({ stock: 2, dupExists: false })
    wireTx(tx)
    const res = await sellCanteenProductAction(input())
    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenCalledTimes(1)
    expect(updateMock).toHaveBeenCalledTimes(1) // se descontó el stock
  })

  it('REGRESIÓN: reintento con la misma key tras agotar el stock devuelve la venta, no "sin stock"', async () => {
    // Estado post-commit de la 1ra venta: stock ya en 0 y el cash_flow existe.
    const { tx, updateMock } = makeTx({ stock: 0, dupExists: true })
    wireTx(tx)
    const res = await sellCanteenProductAction(input())
    expect(res.success).toBe(true) // antes del fix: { success:false, error:'No queda stock de Agua.' }
    expect(updateMock).not.toHaveBeenCalled() // no vuelve a descontar
  })

  it('bloquea cuando la cantidad supera el stock disponible (venta nueva)', async () => {
    const { tx } = makeTx({ stock: 1, dupExists: false })
    wireTx(tx)
    const res = await sellCanteenProductAction(input({ qty: 2 }))
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Solo quedan 1/)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('producto sin control de stock (undefined): vende sin límite y no descuenta', async () => {
    const { tx, updateMock } = makeTx({ dupExists: false }) // stock undefined
    wireTx(tx)
    const res = await sellCanteenProductAction(input({ qty: 5 }))
    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenCalledTimes(1)
    expect(updateMock).not.toHaveBeenCalled() // untracked: no toca stock
  })
})
