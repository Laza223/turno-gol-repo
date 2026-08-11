import { beforeEach, describe, expect, it, vi } from 'vitest'

// R4 (ensayo general, hallazgo 🟡): createCashFlowSchema (caja/actions.ts) NO
// declara bookingId. Antes de este fix, cualquier staff autenticado podía
// invocar la Server Action directo (curl/devtools — la UI nunca manda este
// campo) con un bookingId arbitrario, y createCashFlow lo insertaba SIN
// FOR UPDATE, sin leer getBookingCharges, sin comparar contra el pendiente
// real: reproducía el síntoma de ENS-3 (turno de $100 "cobrado" $570). El
// camino canónico para cobros vinculados a un booking es
// addBookingChargeAction (reservas/actions.ts). Este test pinnea que, por
// más que el input incluya bookingId, z.object() (sin .strict()) lo
// strippea en silencio y jamás llega al service — por caja es
// estructuralmente imposible crear un cash_flow con booking_id.

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

import { createCashFlowAction } from '@/app/(admin)/caja/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import type { CreateCashFlowInput } from '@/modules/cashflow/cashflow.types'

const FAKE_TX = {} as never
const ARBITRARY_BOOKING_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

// CreateCashFlowInput sigue declarando bookingId (lo usan los callers
// legítimos del service, addBookingChargeAction/recordDepositCashFlow) — el
// ataque simulado acá es que caja lo reciba igual por curl/devtools.
const PAYLOAD_WITH_BOOKING_ID: CreateCashFlowInput = {
  type: 'income',
  category: 'product_sale',
  amount: 570000,
  method: 'cash',
  description: 'Cobro manual con bookingId inyectado',
  bookingId: ARBITRARY_BOOKING_ID,
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
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (tx: never) => Promise<unknown>,
  ) => cb(FAKE_TX)) as never)
  vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-1', bookingId: null } as never)
})

describe('createCashFlowAction — bookingId nunca llega al service (hallazgo R4)', () => {
  it('el schema lo strippea: createCashFlow se llama sin la clave bookingId', async () => {
    const res = await createCashFlowAction(PAYLOAD_WITH_BOOKING_ID)

    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenCalledTimes(1)
    const input = vi.mocked(createCashFlow).mock.calls[0]![2] as Record<string, unknown>
    expect(input).not.toHaveProperty('bookingId')
    expect(input.bookingId).toBeUndefined()
  })
})
