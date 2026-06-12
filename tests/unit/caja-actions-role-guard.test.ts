import { beforeEach, describe, expect, it, vi } from 'vitest'

// Cruces #2 y #3 (auditoría cruzada junio): ROLES × CANTINA/CAJA.
// - read_only ("Solo lectura": ver reportes) no puede registrar ventas ni
//   movimientos (createCashFlowAction) ni cerrar la caja (closeDayAction).
// - La configuración de productos de cantina (saveCanteenProductsAction,
//   tenants.settings.canteen_products) es SOLO admin: manager es "Sin acceso
//   a configuración" según roles.ts.
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

import {
  closeDayAction,
  createCashFlowAction,
} from '@/app/(admin)/caja/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import type { CreateCashFlowInput } from '@/modules/cashflow/cashflow.types'

const STAFF_USER = { type: 'staff', staffUserId: 'staff-1', role: 'admin' }
const TENANT = { id: 'tenant-1', settings: {} }
const FAKE_TX = {} as never

const VALID_SALE: CreateCashFlowInput = {
  type: 'income',
  category: 'product_sale',
  amount: 250000,
  method: 'cash',
  description: 'Gaseosa x2',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(STAFF_USER as never)
  vi.mocked(getStaffTenant).mockResolvedValue(TENANT as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
  vi.mocked(withTenantContext).mockImplementation(
    (async (_id: string, cb: (tx: never) => Promise<unknown>) => cb(FAKE_TX)) as never,
  )
})

describe('caja actions — staff read_only es rechazado (cruce #2)', () => {
  beforeEach(() => {
    vi.mocked(getStaffRole).mockResolvedValue('read_only')
  })

  it('createCashFlowAction no registra ventas/movimientos para read_only', async () => {
    const res = await createCashFlowAction(VALID_SALE)
    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
    expect(vi.mocked(withTenantContext)).not.toHaveBeenCalled()
  })

  it('closeDayAction no cierra la caja para read_only', async () => {
    const res = await closeDayAction('2026-06-11', 100000)
    expect(res.success).toBe(false)
    expect(vi.mocked(closeDailyRegister)).not.toHaveBeenCalled()
  })

  it('sin membresía activa (rol null) también rechaza', async () => {
    vi.mocked(getStaffRole).mockResolvedValue(null)
    const res = await createCashFlowAction(VALID_SALE)
    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })
})

describe('caja actions — manager (Encargado) opera la caja (cruce #2)', () => {
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
})

