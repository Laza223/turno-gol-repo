import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Hardening de la auditoría integral del 2026-09-06 (`caja/actions.ts:62`).
 *
 * `occurredAt` no tenía cota superior, así que un movimiento se podía cargar
 * con fecha futura invocando la Server Action directo (curl/devtools; la UI no
 * ofrece el campo). La caja bucketea por día operativo: una fecha adelantada
 * mete plata en un cierre que todavía no ocurrió, y el cierre de hoy nunca la
 * cuenta — la diferencia aparece como faltante sin explicación.
 *
 * La tolerancia es de minutos y no de cero porque el instante lo pone el
 * navegador y su reloj no es el del servidor.
 */
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
const MINUTO = 60_000

function movimiento(occurredAt: Date): CreateCashFlowInput {
  return {
    type: 'income',
    category: 'product_sale',
    amount: 570000,
    method: 'cash',
    description: 'Venta de cantina',
    occurredAt,
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
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (tx: never) => Promise<unknown>,
  ) => cb(FAKE_TX)) as never)
  vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-1', bookingId: null } as never)
})

describe('createCashFlowAction — un movimiento no se fecha en el futuro', () => {
  it('rechaza una fecha de mañana y no llama al service', async () => {
    const res = await createCashFlowAction(movimiento(new Date(Date.now() + 24 * 60 * MINUTO)))

    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('rechaza una fecha una hora adelantada: no alcanza con frenar el día siguiente', async () => {
    const res = await createCashFlowAction(movimiento(new Date(Date.now() + 60 * MINUTO)))

    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('acepta el instante actual', async () => {
    const res = await createCashFlowAction(movimiento(new Date()))

    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenCalledTimes(1)
  })

  it('acepta unos minutos de adelanto: el reloj del navegador no es el del servidor', async () => {
    const res = await createCashFlowAction(movimiento(new Date(Date.now() + 2 * MINUTO)))

    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenCalledTimes(1)
  })

  it('acepta una fecha pasada: cargar el movimiento de ayer es legítimo', async () => {
    const res = await createCashFlowAction(movimiento(new Date(Date.now() - 24 * 60 * MINUTO)))

    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenCalledTimes(1)
  })

  it('sin occurredAt sigue funcionando: el campo es opcional', async () => {
    const { occurredAt: _omitido, ...sinFecha } = movimiento(new Date())

    const res = await createCashFlowAction(sinFecha)

    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenCalledTimes(1)
  })
})
