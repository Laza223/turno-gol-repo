import { beforeEach, describe, expect, it, vi } from 'vitest'

// Rediseño Caja/Cantina Fase 2: sellCanteenProductAction (JSONB
// tenants.settings.canteen_products) fue reemplazada por sellTicketAction,
// un wrapper delgado sobre canteen-sale.service#sellTicket (parse → guard →
// rate limit → withTenantContext → sellTicket → mapeo de errores es-AR). La
// lógica de idempotencia-antes-que-stock y el descuento atómico que este
// archivo blindaba antes viven ahora DENTRO del service y se cubren con DB
// real en tests/integration/canteen-sale.test.ts. Lo que sigue siendo
// responsabilidad de la action —y lo que este archivo blinda ahora— es el
// mapeo de cada error de dominio del service al copy es-AR que ve el staff.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn(), getDb: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/modules/canteen/canteen-sale.service', () => ({ sellTicket: vi.fn() }))

import { sellTicketAction } from '@/app/(admin)/caja/cantina/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { sellTicket } from '@/modules/canteen/canteen-sale.service'
import {
  EmptyTicketError,
  InsufficientStockError,
  ProductInactiveError,
  ProductNotFoundError,
} from '@/modules/canteen/canteen.errors'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'

const KEY = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const PRODUCT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const FAKE_TX = {} as never

function input(over: { qty?: number } = {}) {
  return {
    lines: [{ productId: PRODUCT_ID, qty: over.qty ?? 1 }],
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
  vi.mocked(withTenantContext).mockImplementation(
    (async (_id: string, cb: (t: never) => Promise<unknown>) => cb(FAKE_TX)) as never,
  )
})

describe('sellTicketAction — mapeo de errores es-AR', () => {
  it('venta exitosa devuelve { success: true, total }', async () => {
    vi.mocked(sellTicket).mockResolvedValue({ cashFlowId: 'cf-1', total: 150000, duplicate: false })
    const res = await sellTicketAction(input())
    expect(res).toEqual({ success: true, total: 150000 })
  })

  it('InsufficientStockError con available=0 → "No queda stock de {producto}."', async () => {
    vi.mocked(sellTicket).mockRejectedValue(new InsufficientStockError('Agua', 0))
    const res = await sellTicketAction(input({ qty: 2 }))
    expect(res).toEqual({ success: false, error: 'No queda stock de Agua.' })
  })

  it('InsufficientStockError con available>0 → "Solo quedan N de {producto}."', async () => {
    vi.mocked(sellTicket).mockRejectedValue(new InsufficientStockError('Agua', 1))
    const res = await sellTicketAction(input({ qty: 2 }))
    expect(res).toEqual({ success: false, error: 'Solo quedan 1 de Agua.' })
  })

  it('ProductNotFoundError → "Ese producto ya no existe."', async () => {
    vi.mocked(sellTicket).mockRejectedValue(new ProductNotFoundError(PRODUCT_ID))
    const res = await sellTicketAction(input())
    expect(res).toEqual({ success: false, error: 'Ese producto ya no existe.' })
  })

  it('ProductInactiveError → "Ese producto está pausado."', async () => {
    vi.mocked(sellTicket).mockRejectedValue(new ProductInactiveError('Agua'))
    const res = await sellTicketAction(input())
    expect(res).toEqual({ success: false, error: 'Ese producto está pausado.' })
  })

  it('EmptyTicketError → "El ticket está vacío."', async () => {
    vi.mocked(sellTicket).mockRejectedValue(new EmptyTicketError())
    const res = await sellTicketAction(input())
    expect(res).toEqual({ success: false, error: 'El ticket está vacío.' })
  })

  it('DayAlreadyClosedError → copy de caja cerrada (mismo texto que el action viejo)', async () => {
    vi.mocked(sellTicket).mockRejectedValue(new DayAlreadyClosedError('2026-06-11'))
    const res = await sellTicketAction(input())
    expect(res).toEqual({
      success: false,
      error: 'La caja de ese día ya fue cerrada. Registrá un ajuste compensatorio.',
    })
  })

  it('un error no mapeado se re-lanza (no se traga silenciosamente)', async () => {
    vi.mocked(sellTicket).mockRejectedValue(new Error('boom'))
    await expect(sellTicketAction(input())).rejects.toThrow('boom')
  })
})
