import { beforeEach, describe, expect, it, vi } from 'vitest'

// Cruces #2 y #3 (auditoría cruzada junio) — vigentes tras el rediseño
// Caja/Cantina Fase 2 (JSONB → tablas reales, migr. 048):
// - admin y manager (Encargado) operan la caja Y la cantina (vender ticket,
//   reponer stock, dar salidas no comerciales): requireOperatorStaff.
// - El catálogo de cantina (alta/edición/pausa de producto) sigue siendo
//   SOLO admin: manager es "Sin acceso a configuración" según roles.ts —
//   ahora vía requireAdminStaffAction en caja/productos/actions.ts, mismo
//   criterio que antes tenía saveCanteenProductsAction (JSONB, eliminada).
// El rol se lee de la DB — el claim del JWT está hardcodeado a 'admin'.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn(), getDb: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/modules/cashflow/cashflow.service', () => ({ createCashFlow: vi.fn() }))
vi.mock('@/modules/cashflow/daily-close.service', () => ({ closeDailyRegister: vi.fn() }))
vi.mock('@/modules/canteen/canteen-sale.service', () => ({ sellTicket: vi.fn() }))
vi.mock('@/modules/canteen/canteen.service', () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deactivateProduct: vi.fn(),
}))
vi.mock('@/modules/canteen/stock.service', () => ({
  registerPurchase: vi.fn(),
  registerExit: vi.fn(),
  adjustStock: vi.fn(),
}))

import { closeDayAction, createCashFlowAction } from '@/app/(admin)/caja/actions'
import { sellTicketAction } from '@/app/(admin)/caja/cantina/actions'
import {
  createProductAction,
  updateProductAction,
  registerPurchaseAction,
} from '@/app/(admin)/caja/productos/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import { sellTicket } from '@/modules/canteen/canteen-sale.service'
import { createProduct, updateProduct } from '@/modules/canteen/canteen.service'
import { registerPurchase } from '@/modules/canteen/stock.service'
import type { CreateCashFlowInput } from '@/modules/cashflow/cashflow.types'

const STAFF_USER = { type: 'staff', staffUserId: 'staff-1', role: 'admin' }
const TENANT = { id: 'tenant-1', settings: {} }
const FAKE_TX = {} as never
const PRODUCT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const KEY = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const VALID_SALE: CreateCashFlowInput = {
  type: 'income',
  category: 'product_sale',
  amount: 250000,
  method: 'cash',
  description: 'Gaseosa x2',
}

const TICKET = {
  lines: [{ productId: PRODUCT_ID, qty: 1 }],
  method: 'cash' as const,
  clientIdempotencyKey: KEY,
}

const PURCHASE = {
  productId: PRODUCT_ID,
  units: 24,
  clientIdempotencyKey: KEY,
}

const NEW_PRODUCT = { name: 'Gaseosa', price: 125000 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(STAFF_USER as never)
  vi.mocked(getStaffTenant).mockResolvedValue(TENANT as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
  vi.mocked(withTenantContext).mockImplementation(
    (async (_id: string, cb: (tx: never) => Promise<unknown>) => cb(FAKE_TX)) as never,
  )
})

describe('caja/cantina/productos — staff sin membresía activa (rol null) es rechazado (cruce #2)', () => {
  beforeEach(() => {
    vi.mocked(getStaffRole).mockResolvedValue(null)
  })

  it('createCashFlowAction no registra ventas/movimientos sin rol', async () => {
    const res = await createCashFlowAction(VALID_SALE)
    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
    expect(vi.mocked(withTenantContext)).not.toHaveBeenCalled()
  })

  it('closeDayAction no cierra la caja sin rol', async () => {
    const res = await closeDayAction('2026-06-11', 100000)
    expect(res.success).toBe(false)
    expect(vi.mocked(closeDailyRegister)).not.toHaveBeenCalled()
  })

  it('sellTicketAction no vende cantina sin rol', async () => {
    const res = await sellTicketAction(TICKET)
    expect(res.success).toBe(false)
    expect(vi.mocked(sellTicket)).not.toHaveBeenCalled()
  })

  it('registerPurchaseAction no repone stock sin rol', async () => {
    const res = await registerPurchaseAction(PURCHASE)
    expect(res.success).toBe(false)
    expect(vi.mocked(registerPurchase)).not.toHaveBeenCalled()
  })

  it('createProductAction no crea catálogo sin rol', async () => {
    const res = await createProductAction(NEW_PRODUCT)
    expect(res.success).toBe(false)
    expect(vi.mocked(createProduct)).not.toHaveBeenCalled()
  })
})

describe('caja/cantina — manager (Encargado) opera la caja y la cantina (cruce #2)', () => {
  beforeEach(() => {
    vi.mocked(getStaffRole).mockResolvedValue('manager')
  })

  it('createCashFlowAction funciona para manager (permiso documentado)', async () => {
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-1' } as never)
    const res = await createCashFlowAction(VALID_SALE)
    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenCalledWith(
      'tenant-1',
      'staff-1',
      expect.objectContaining({ category: 'product_sale', amount: 250000 }),
      FAKE_TX,
    )
  })

  it('closeDayAction funciona para manager', async () => {
    vi.mocked(closeDailyRegister).mockResolvedValue({ id: 'close-1' } as never)
    const res = await closeDayAction('2026-06-11', 100000)
    expect(res.success).toBe(true)
    expect(vi.mocked(closeDailyRegister)).toHaveBeenCalled()
  })

  it('sellTicketAction funciona para manager (vender cantina es operativo)', async () => {
    vi.mocked(sellTicket).mockResolvedValue({ cashFlowId: 'cf-2', total: 125000, duplicate: false })
    const res = await sellTicketAction(TICKET)
    expect(res).toEqual({ success: true, total: 125000 })
  })

  it('registerPurchaseAction funciona para manager (reponer stock es operativo)', async () => {
    vi.mocked(registerPurchase).mockResolvedValue({ duplicate: false })
    const res = await registerPurchaseAction(PURCHASE)
    expect(res.success).toBe(true)
  })

  it('manager NO puede crear productos de catálogo (Sin acceso a configuración, cruce #3)', async () => {
    const res = await createProductAction(NEW_PRODUCT)
    expect(res.success).toBe(false)
    expect(vi.mocked(createProduct)).not.toHaveBeenCalled()
  })

  it('manager NO puede editar productos de catálogo', async () => {
    const res = await updateProductAction({ productId: PRODUCT_ID, patch: { price: 200000 } })
    expect(res.success).toBe(false)
    expect(vi.mocked(updateProduct)).not.toHaveBeenCalled()
  })
})

describe('caja/productos — catálogo es solo admin (cruce #3, ex saveCanteenProductsAction)', () => {
  beforeEach(() => {
    vi.mocked(getStaffRole).mockResolvedValue('admin')
  })

  it('admin sí puede crear productos', async () => {
    vi.mocked(createProduct).mockResolvedValue({
      id: 'p-1',
      tenantId: 'tenant-1',
      name: 'Gaseosa',
      price: 125000,
      cost: null,
      stock: null,
      minStock: null,
      isActive: true,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)
    const res = await createProductAction(NEW_PRODUCT)
    expect(res.success).toBe(true)
    expect(vi.mocked(createProduct)).toHaveBeenCalled()
  })

  it('admin sí puede editar productos', async () => {
    vi.mocked(updateProduct).mockResolvedValue({} as never)
    const res = await updateProductAction({ productId: PRODUCT_ID, patch: { price: 200000 } })
    expect(res.success).toBe(true)
    expect(vi.mocked(updateProduct)).toHaveBeenCalled()
  })
})
