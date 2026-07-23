import { beforeEach, describe, expect, it, vi } from 'vitest'

// Cruce #10 (auditoría cruzada junio): CanteenQuickSale y RegisterMovementModal
// generan un crypto.randomUUID() por venta y lo mandan como
// clientIdempotencyKey, pero createCashFlowSchema no declaraba la clave y
// z.object() la strippeaba en safeParse → el ON CONFLICT (client_idempotency_key)
// DO NOTHING del service quedaba muerto y el doble-tap duplicaba la venta.
// Este test asserta que la key SOBREVIVE el parseo de la action y llega al service.

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

import { createCashFlowAction } from '@/app/(admin)/caja/actions'
import { sellTicketAction } from '@/app/(admin)/caja/cantina/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { sellTicket } from '@/modules/canteen/canteen-sale.service'
import type { CreateCashFlowInput } from '@/modules/cashflow/cashflow.types'

const FAKE_TX = {} as never
const IDEMPOTENCY_KEY = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const PRODUCT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const SALE_WITH_KEY: CreateCashFlowInput = {
  type: 'income',
  category: 'product_sale',
  amount: 125000,
  method: 'cash',
  description: 'Gaseosa',
  clientIdempotencyKey: IDEMPOTENCY_KEY,
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
    (async (_id: string, cb: (tx: never) => Promise<unknown>) => cb(FAKE_TX)) as never,
  )
  vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-1' } as never)
})

describe('createCashFlowAction — clientIdempotencyKey sobrevive al schema (cruce #10)', () => {
  it('la key del cliente llega intacta a createCashFlow (no la strippea zod)', async () => {
    const res = await createCashFlowAction(SALE_WITH_KEY)
    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenCalledWith(
      'tenant-1',
      'staff-1',
      expect.objectContaining({ clientIdempotencyKey: IDEMPOTENCY_KEY }),
      FAKE_TX,
    )
  })

  it('una key no-UUID se rechaza (la genera crypto.randomUUID, nunca el usuario)', async () => {
    const res = await createCashFlowAction({
      ...SALE_WITH_KEY,
      clientIdempotencyKey: 'doble-tap',
    })
    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('sin key el movimiento sigue funcionando (campo opcional)', async () => {
    const { clientIdempotencyKey: _omit, ...saleWithoutKey } = SALE_WITH_KEY
    const res = await createCashFlowAction(saleWithoutKey)
    expect(res.success).toBe(true)
    const input = vi.mocked(createCashFlow).mock.calls[0]![2]
    expect(input.clientIdempotencyKey).toBeUndefined()
  })
})

// sellTicketSchema (canteen.schema.ts, migr. 048) es más estricto que
// createCashFlowSchema: clientIdempotencyKey es OBLIGATORIO (nunca .optional()),
// mismo criterio que ya tenía la vieja sellCanteenProductSchema — un doble-tap
// sin key no tiene forma de deduplicarse contra cash_flows.client_idempotency_key.
describe('sellTicketAction — clientIdempotencyKey obligatoria y UUID (schema nuevo, migr. 048)', () => {
  const TICKET = {
    lines: [{ productId: PRODUCT_ID, qty: 1 }],
    method: 'cash' as const,
  }

  beforeEach(() => {
    vi.mocked(sellTicket).mockResolvedValue({ cashFlowId: 'cf-1', total: 150000, duplicate: false })
  })

  it('una key UUID válida llega intacta a sellTicket', async () => {
    const res = await sellTicketAction({ ...TICKET, clientIdempotencyKey: IDEMPOTENCY_KEY })
    expect(res.success).toBe(true)
    expect(vi.mocked(sellTicket)).toHaveBeenCalledWith(
      'tenant-1',
      'staff-1',
      expect.objectContaining({ clientIdempotencyKey: IDEMPOTENCY_KEY }),
      FAKE_TX,
    )
  })

  it('sin key se rechaza (a diferencia de createCashFlowAction, acá es obligatoria)', async () => {
    const res = await sellTicketAction(TICKET)
    expect(res.success).toBe(false)
    expect(vi.mocked(sellTicket)).not.toHaveBeenCalled()
  })

  it('una key no-UUID se rechaza', async () => {
    const res = await sellTicketAction({ ...TICKET, clientIdempotencyKey: 'doble-tap' })
    expect(res.success).toBe(false)
    expect(vi.mocked(sellTicket)).not.toHaveBeenCalled()
  })
})
