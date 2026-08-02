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
vi.mock('@/modules/cashflow/cash-open.service', () => ({ openDay: vi.fn() }))
vi.mock('@/modules/canteen/canteen-sale.service', () => ({ sellTicket: vi.fn() }))
vi.mock('@/modules/canteen/canteen-tab.service', () => ({
  createTab: vi.fn(),
  settleTab: vi.fn(),
  cancelTab: vi.fn(),
  listOpenTabs: vi.fn(),
}))
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

import { closeDayAction, openDayAction, createCashFlowAction } from '@/app/(admin)/caja/actions'
import {
  sellTicketAction,
  createTabAction,
  settleTabAction,
  cancelTabAction,
} from '@/app/(admin)/caja/cantina/actions'
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
import { openDay } from '@/modules/cashflow/cash-open.service'
import { sellTicket } from '@/modules/canteen/canteen-sale.service'
import { createTab, settleTab, cancelTab } from '@/modules/canteen/canteen-tab.service'
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

const TAB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const KEY_2 = 'aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff'

const CREATE_TAB = {
  debtorName: 'Capitán equipo 22hs',
  lines: [{ productId: PRODUCT_ID, qty: 1 }],
  clientIdempotencyKey: KEY,
}

const SETTLE_TAB = {
  tabId: TAB_ID,
  charges: [{ amount: 250000, method: 'cash' as const }],
  clientIdempotencyKey: KEY_2,
}

const CANCEL_TAB = {
  tabId: TAB_ID,
  reason: 'Se pagó en el momento',
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

  it('createTabAction no anota fiado sin rol', async () => {
    const res = await createTabAction(CREATE_TAB)
    expect(res.success).toBe(false)
    expect(vi.mocked(createTab)).not.toHaveBeenCalled()
  })

  it('settleTabAction no cobra fiado sin rol', async () => {
    const res = await settleTabAction(SETTLE_TAB)
    expect(res.success).toBe(false)
    expect(vi.mocked(settleTab)).not.toHaveBeenCalled()
  })

  it('cancelTabAction no anula fiado sin rol', async () => {
    const res = await cancelTabAction(CANCEL_TAB)
    expect(res.success).toBe(false)
    expect(vi.mocked(cancelTab)).not.toHaveBeenCalled()
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

  it('createTabAction funciona para manager (anotar fiado es operativo)', async () => {
    vi.mocked(createTab).mockResolvedValue({
      tab: { debtorName: 'Capitán equipo 22hs', totalAmount: 125000 } as never,
      duplicate: false,
    })
    const res = await createTabAction(CREATE_TAB)
    expect(res).toEqual({ success: true, debtorName: 'Capitán equipo 22hs', total: 125000 })
  })

  it('settleTabAction funciona para manager (cobrar fiado es operativo)', async () => {
    vi.mocked(settleTab).mockResolvedValue({ tab: { totalAmount: 125000 } as never, duplicate: false })
    const res = await settleTabAction(SETTLE_TAB)
    expect(res).toEqual({ success: true, total: 125000 })
  })

  it('cancelTabAction funciona para manager (anular fiado es operativo)', async () => {
    vi.mocked(cancelTab).mockResolvedValue({} as never)
    const res = await cancelTabAction(CANCEL_TAB)
    expect(res.success).toBe(true)
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

// Hallazgo 🔴 del verificador adversarial (día operativo): cutoffMins NO debe
// viajar del cliente — closeDayAction/openDayAction lo recalculan server-side
// desde el tenant ya autenticado, para que un valor manipulado no pueda
// excluir plata real de un cierre que después queda congelado (sin
// re-bucketing histórico, ver ADR día operativo).
describe('closeDayAction/openDayAction — cutoffMins se recalcula server-side (no viaja del cliente)', () => {
  const NIGHT_TENANT = {
    id: 'tenant-night',
    settings: {},
    closesNextDay: true,
    openingHours: {
      mon: { open: '20:00', close: '02:00' },
      tue: { open: '20:00', close: '02:00' },
      wed: { open: '20:00', close: '02:00' },
      thu: { open: '20:00', close: '02:00' },
      fri: { open: '20:00', close: '02:00' },
      sat: { open: '20:00', close: '02:00' },
      sun: { open: '20:00', close: '02:00' },
    },
  }

  beforeEach(() => {
    vi.mocked(getStaffRole).mockResolvedValue('admin')
    vi.mocked(getStaffTenant).mockResolvedValue(NIGHT_TENANT as never)
  })

  it('closeDayAction pasa el cutoffMins real del tenant (120), no un valor arbitrario del caller', async () => {
    vi.mocked(closeDailyRegister).mockResolvedValue({ id: 'close-1' } as never)
    // closeDayAction ya NO acepta cutoffMins en su firma — no hay forma de
    // que el caller lo inyecte. Firma actual: (date, declaredCash?, note?).
    await closeDayAction('2026-06-11', 100000)
    expect(vi.mocked(closeDailyRegister)).toHaveBeenCalledWith(
      NIGHT_TENANT.id,
      '2026-06-11',
      'staff-1',
      { declaredCash: 100000, note: undefined },
      120,
      FAKE_TX,
    )
  })

  it('openDayAction pasa el cutoffMins real del tenant (120)', async () => {
    vi.mocked(openDay).mockResolvedValue({ openingCash: 50000 } as never)
    await openDayAction({ date: '2026-06-11', openingCash: 50000 })
    expect(vi.mocked(openDay)).toHaveBeenCalledWith(
      NIGHT_TENANT.id,
      'staff-1',
      { date: '2026-06-11', openingCash: 50000, note: undefined },
      120,
      FAKE_TX,
    )
  })
})
