import { beforeEach, describe, expect, it, vi } from 'vitest'

// AL7 (Fase C: firma nueva `(tenantId, input)`) — el interruptor de TurnoGol Plus es solo del super-admin. Con un guard
// que rechaza no se toca ni el cobro ni el flag (negativo); con uno que acepta
// el servicio se llama con actor `system` (positivo).

const TENANT = '11111111-1111-4111-8111-111111111111'

const { requireSystemAdminAction, enablePlus, disablePlus, getPlusAdminState } = vi.hoisted(() => ({
  requireSystemAdminAction: vi.fn(),
  enablePlus: vi.fn(),
  disablePlus: vi.fn(),
  getPlusAdminState: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/modules/auth/system-admin.guards', () => ({ requireSystemAdminAction }))
vi.mock('@/modules/billing/plus.service', () => ({ enablePlus, disablePlus, getPlusAdminState }))
vi.mock('@/modules/billing/billing.gateway', () => ({ getBillingGateway: () => ({}) }))

import { setTenantPlusAction } from '@/app/(super-admin)/super-admin/tenants/[id]/actions'

beforeEach(() => {
  vi.clearAllMocks()
  getPlusAdminState.mockResolvedValue({ pricePerCourtCents: 1_500_000 })
  enablePlus.mockResolvedValue({ kind: 'enabled' })
  disablePlus.mockResolvedValue({ kind: 'turned_off' })
})

const ENABLE = { op: 'enable', pricePerCourtCents: 1_500_000 } as const
const DISABLE_NOW = { op: 'disable', mode: 'immediate' } as const

describe('setTenantPlusAction — autorización', () => {
  it('negativo: sin super-admin (staff del complejo, encargado, jugador u otro admin) no toca nada', async () => {
    requireSystemAdminAction.mockResolvedValue({ ok: false, error: 'No autorizado.' })

    for (const input of [ENABLE, DISABLE_NOW, { op: 'disable', mode: 'end_of_period' } as const]) {
      const res = await setTenantPlusAction(TENANT, input)
      expect(res).toEqual({ success: false, error: 'No autorizado.' })
    }

    expect(enablePlus).not.toHaveBeenCalled()
    expect(disablePlus).not.toHaveBeenCalled()
  })

  it('negativo: un tenantId que no es uuid no llega al servicio', async () => {
    requireSystemAdminAction.mockResolvedValue({ ok: true, admin: { id: 'sa-1' } })

    const res = await setTenantPlusAction('no-es-un-uuid', ENABLE)

    expect(res.success).toBe(false)
    expect(enablePlus).not.toHaveBeenCalled()
  })

  it('positivo: prender pasa el precio tipeado al service y actúa como system', async () => {
    requireSystemAdminAction.mockResolvedValue({ ok: true, admin: { id: 'sa-1' } })

    const res = await setTenantPlusAction(TENANT, ENABLE)

    expect(res).toEqual({
      success: true,
      message: expect.stringContaining('el próximo débito suma'),
    })
    expect(enablePlus).toHaveBeenCalledTimes(1)
    const [tenantId, input, actor] = enablePlus.mock.calls[0]!
    expect(tenantId).toBe(TENANT)
    expect(input).toEqual({ pricePerCourtCents: 1_500_000 })
    expect(actor).toEqual({ type: 'system', id: 'sa-1' })
    expect(disablePlus).not.toHaveBeenCalled()
  })

  it('F5: precio null = lista: la action lo acepta y se lo pasa tal cual al service (no fija el número de hoy)', async () => {
    requireSystemAdminAction.mockResolvedValue({ ok: true, admin: { id: 'sa-1' } })

    const res = await setTenantPlusAction(TENANT, { op: 'enable', pricePerCourtCents: null })

    expect(res).toMatchObject({ success: true, message: expect.stringContaining('15.000') })
    expect(enablePlus).toHaveBeenCalledTimes(1)
    expect(enablePlus.mock.calls[0]![1]).toEqual({ pricePerCourtCents: null })
  })

  it('positivo: la baja pasa el modo pedido (inmediata y a fin de período)', async () => {
    requireSystemAdminAction.mockResolvedValue({ ok: true, admin: { id: 'sa-1' } })

    expect((await setTenantPlusAction(TENANT, DISABLE_NOW)).success).toBe(true)
    disablePlus.mockResolvedValue({
      kind: 'scheduled',
      accessUntil: new Date('2027-03-15T12:00:00Z'),
    })
    const res = await setTenantPlusAction(TENANT, { op: 'disable', mode: 'end_of_period' })
    expect(res).toMatchObject({ success: true, message: expect.stringContaining('15/03') })

    expect(disablePlus.mock.calls.map((c) => c[1])).toEqual([
      { mode: 'immediate' },
      { mode: 'end_of_period' },
    ])
    expect(disablePlus.mock.calls[0]![2]).toEqual({ type: 'system', id: 'sa-1' })
    expect(enablePlus).not.toHaveBeenCalled()
  })

  it('un alta anual con cotización avisa los meses y que el dueño paga en Facturación', async () => {
    requireSystemAdminAction.mockResolvedValue({ ok: true, admin: { id: 'sa-1' } })
    enablePlus.mockResolvedValue({ kind: 'quote_pending', months: 5, amountCents: 33_750_000 })

    const res = await setTenantPlusAction(TENANT, ENABLE)

    expect(res).toMatchObject({
      success: true,
      message: expect.stringMatching(/Se cotizaron 5 meses.*Facturación/),
    })
  })
})

describe('setTenantPlusAction — validación Zod', () => {
  it.each([
    ['precio 0', { op: 'enable', pricePerCourtCents: 0 }],
    ['precio negativo', { op: 'enable', pricePerCourtCents: -100 }],
    ['precio decimal', { op: 'enable', pricePerCourtCents: 1500.5 }],
    [
      'H7: precio que no entra en un integer de la DB',
      { op: 'enable', pricePerCourtCents: 2_147_483_648 },
    ],
    ['precio texto', { op: 'enable', pricePerCourtCents: '1500' }],
    ['sin precio', { op: 'enable' }],
    ['op desconocido', { op: 'toggle' }],
    ['modo desconocido', { op: 'disable', mode: 'whenever' }],
    ['booleano de la firma vieja', true],
  ])('rechaza %s sin llegar al service', async (_name, bad) => {
    requireSystemAdminAction.mockResolvedValue({ ok: true, admin: { id: 'sa-1' } })

    const res = await setTenantPlusAction(TENANT, bad as never)

    expect(res.success).toBe(false)
    expect(enablePlus).not.toHaveBeenCalled()
    expect(disablePlus).not.toHaveBeenCalled()
  })
})
