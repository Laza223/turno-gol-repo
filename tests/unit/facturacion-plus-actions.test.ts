import { beforeEach, describe, expect, it, vi } from 'vitest'

// BJ7 — "Dar de baja el Asistente" y "Pagar los meses que faltan" son del admin
// del complejo. Con un guard que rechaza (encargado, jugador, otro rol) no se
// llama al service; con uno que acepta, el complejo sale del GUARD y nunca de un
// parámetro.

const { requireBillingAdminStaffAction, disablePlus, startPlusProratePayment, adminRateLimited } =
  vi.hoisted(() => ({
    requireBillingAdminStaffAction: vi.fn(),
    disablePlus: vi.fn(),
    startPlusProratePayment: vi.fn(),
    adminRateLimited: vi.fn(),
  }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({
  requireAdminStaffAction: vi.fn(),
  requireBillingAdminStaffAction,
}))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited }))
vi.mock('@/modules/billing/plus.service', () => ({ disablePlus, startPlusProratePayment }))
vi.mock('@/modules/billing/billing.gateway', () => ({ getBillingGateway: () => ({ gw: true }) }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/shared/db/audit', () => ({ insertAuditLog: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ disconnectMercadoPago: vi.fn() }))
vi.mock('@/modules/billing/billing.service', () => ({ setBillingPayerEmail: vi.fn() }))

import { revalidatePath } from 'next/cache'
import {
  disablePlusAction,
  startPlusProratePaymentAction,
} from '@/app/(admin)/settings/facturacion/actions'
import { PlusNotAllowedError, PlusQuoteNotPendingError } from '@/modules/billing/billing.errors'

const OK = { ok: true, tenant: { id: 'tenant-del-guard' }, user: { staffUserId: 'staff-1' } }
const DENIED = { ok: false, error: 'No tenés permiso.' }

beforeEach(() => {
  vi.clearAllMocks()
  adminRateLimited.mockResolvedValue(null)
  disablePlus.mockResolvedValue({
    kind: 'scheduled',
    accessUntil: new Date('2027-03-15T12:00:00Z'),
  })
  startPlusProratePayment.mockResolvedValue({ checkoutUrl: 'https://mp.test/checkout' })
})

describe('disablePlusAction', () => {
  it('negativo: si el guard rechaza (encargado u otro rol) no se llama a disablePlus', async () => {
    requireBillingAdminStaffAction.mockResolvedValue(DENIED)

    const res = await disablePlusAction()

    expect(res).toEqual({ success: false, error: 'No tenés permiso.' })
    expect(disablePlus).not.toHaveBeenCalled()
  })

  it('positivo: llega a disablePlus con end_of_period, SU tenant y actor staff', async () => {
    requireBillingAdminStaffAction.mockResolvedValue(OK)

    const res = await disablePlusAction()

    expect(res).toEqual({ success: true, accessUntil: '2027-03-15T12:00:00.000Z' })
    expect(disablePlus).toHaveBeenCalledTimes(1)
    const [tenantId, input, actor, gateway] = disablePlus.mock.calls[0]!
    expect(tenantId).toBe('tenant-del-guard')
    expect(input).toEqual({ mode: 'end_of_period' })
    expect(actor).toEqual({ type: 'staff', id: 'staff-1' })
    expect(gateway).toEqual({ gw: true })
    expect(revalidatePath).toHaveBeenCalledWith('/settings/facturacion')
  })

  it('el tenant sale del guard y nunca de un parámetro: la action no acepta argumentos', async () => {
    requireBillingAdminStaffAction.mockResolvedValue(OK)
    expect(disablePlusAction.length).toBe(0)
    // Aunque un cliente malicioso mande un tenant ajeno como argumento, se ignora.
    await (disablePlusAction as unknown as (x: string) => Promise<unknown>)('tenant-ajeno')
    expect(disablePlus.mock.calls[0]![0]).toBe('tenant-del-guard')
  })

  it('con el rate limit activo no llama al service', async () => {
    requireBillingAdminStaffAction.mockResolvedValue(OK)
    adminRateLimited.mockResolvedValue('Demasiados intentos.')

    const res = await disablePlusAction()

    expect(res).toEqual({ success: false, error: 'Demasiados intentos.' })
    expect(disablePlus).not.toHaveBeenCalled()
  })

  it('un error conocido sale como mensaje en criollo, sin stack ni ids', async () => {
    requireBillingAdminStaffAction.mockResolvedValue(OK)
    disablePlus.mockRejectedValue(new PlusNotAllowedError('tenant-del-guard', 'past_due'))

    const res = await disablePlusAction()

    expect(res).toEqual({
      success: false,
      error: 'Primero tenés que regularizar el pago de tu cuota.',
    })
  })

  it('un error desconocido no filtra el mensaje interno', async () => {
    requireBillingAdminStaffAction.mockResolvedValue(OK)
    disablePlus.mockRejectedValue(new Error('connection to 10.0.0.5 refused'))

    const res = await disablePlusAction()

    expect(res.success).toBe(false)
    expect(JSON.stringify(res)).not.toContain('10.0.0.5')
  })
})

describe('startPlusProratePaymentAction', () => {
  it('negativo: si el guard rechaza no se llama a startPlusProratePayment', async () => {
    requireBillingAdminStaffAction.mockResolvedValue(DENIED)

    const res = await startPlusProratePaymentAction()

    expect(res).toEqual({ success: false, error: 'No tenés permiso.' })
    expect(startPlusProratePayment).not.toHaveBeenCalled()
  })

  it('positivo: usa SU tenant (del guard, sin argumentos) y devuelve el checkoutUrl', async () => {
    requireBillingAdminStaffAction.mockResolvedValue(OK)

    const res = await startPlusProratePaymentAction()

    expect(res).toEqual({ success: true, checkoutUrl: 'https://mp.test/checkout' })
    expect(startPlusProratePaymentAction.length).toBe(0)
    expect(startPlusProratePayment.mock.calls[0]![0]).toBe('tenant-del-guard')
  })

  it('sin cotización pendiente avisa en criollo', async () => {
    requireBillingAdminStaffAction.mockResolvedValue(OK)
    startPlusProratePayment.mockRejectedValue(new PlusQuoteNotPendingError('tenant-del-guard'))

    const res = await startPlusProratePaymentAction()

    expect(res.success).toBe(false)
    expect(res).toMatchObject({ error: expect.stringContaining('No hay ningún pago pendiente') })
  })
})
