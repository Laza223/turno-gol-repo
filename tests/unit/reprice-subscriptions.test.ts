import { describe, expect, it, vi } from 'vitest'
import { buildManifest, applyManifest } from '../../scripts/billing/reprice-subscriptions'
import type { GatewaySubscriptionState } from '@/modules/payments/payment.types'

function setup(cycle: 'monthly' | 'annual' = 'monthly') {
  const future = new Date(Date.now() + 30 * 86400000).toISOString()
  const local = {
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: '22222222-2222-4222-8222-222222222222',
    tenantStatus: 'trialing',
    status: 'trialing',
    planId: '33333333-3333-4333-8333-333333333333',
    planSlug: 'turnogol',
    billingCycle: cycle,
    billedCourts: 5,
    mpSubscriptionId: 'preapproval',
    currentPeriodStart: future,
    currentPeriodEnd: future,
    trialEndsAt: future,
    updatedAt: future.replace('Z', '000Z'),
    pendingBilledCourts: 3,
    pendingChangeAt: future,
    priceLockedUntil: null,
  }
  let remote: GatewaySubscriptionState = {
    preapprovalId: 'preapproval',
    status: 'authorized',
    externalReference: local.tenantId,
    amountCents: cycle === 'annual' ? 180_360_000 : 16_700_000,
    frequency: cycle === 'annual' ? 12 : 1,
    frequencyType: 'months',
    startDate: new Date(future),
    nextPaymentDate: new Date(future),
    chargedQuantity: 0,
    lastChargedDate: null,
    lastChargedAmountCents: null,
  }
  const deps = {
    readLocal: vi.fn(async () => ({ ...local })),
    recordAudit: vi.fn(async () => {}),
    gateway: {
      getSubscriptionState: vi.fn(async (): Promise<GatewaySubscriptionState | null> => ({
        ...remote,
      })),
      updatePreapprovalAmount: vi.fn(async (_id: string, amount: number) => {
        remote.amountCents = amount
      }),
    },
  }
  return {
    local,
    deps,
    setRemote: (patch: Partial<GatewaySubscriptionState>) => {
      remote = { ...remote, ...patch }
    },
  }
}

describe('repricing operacional', () => {
  it.each([
    ['monthly', 15_000_000],
    ['annual', 162_000_000],
  ] as const)('inventario %s sin escrituras', async (cycle, target) => {
    const { local, deps } = setup(cycle)
    const manifest = await buildManifest([local], deps.gateway)
    expect(manifest.entries[0].targetCents).toBe(target)
    expect(deps.gateway.updatePreapprovalAmount).not.toHaveBeenCalled()
    expect(deps.recordAudit).not.toHaveBeenCalled()
    await applyManifest(JSON.parse(JSON.stringify(manifest)), deps)
    expect(deps.gateway.updatePreapprovalAmount).toHaveBeenCalledWith('preapproval', target)
    expect(deps.recordAudit).toHaveBeenCalledTimes(1)
    expect(local.pendingBilledCourts).toBe(3)
    expect(local.pendingChangeAt).toBe(local.trialEndsAt)
  })
  it('retoma un timeout posterior al PUT sin repetirlo y registra la auditoría', async () => {
    const { local, deps, setRemote } = setup()
    const manifest = await buildManifest([local], deps.gateway)
    deps.gateway.updatePreapprovalAmount.mockImplementationOnce(async () => {
      setRemote({ amountCents: 15_000_000 })
      throw new Error('timeout')
    })
    await expect(applyManifest(manifest, deps)).rejects.toThrow('timeout')
    await applyManifest(manifest, deps)
    expect(deps.gateway.updatePreapprovalAmount).toHaveBeenCalledTimes(1)
    expect(deps.recordAudit).toHaveBeenCalledTimes(1)
  })
  it('retoma una auditoría fallida sin repetir el PUT', async () => {
    const { local, deps } = setup()
    const manifest = await buildManifest([local], deps.gateway)
    deps.recordAudit.mockRejectedValueOnce(new Error('audit failed'))
    await expect(applyManifest(manifest, deps)).rejects.toThrow('audit failed')
    await applyManifest(manifest, deps)
    expect(deps.gateway.updatePreapprovalAmount).toHaveBeenCalledTimes(1)
    expect(deps.recordAudit).toHaveBeenCalledTimes(2)
  })
  it.each([
    'billedCourts',
    'pendingBilledCourts',
    'status',
    'mpSubscriptionId',
    'currentPeriodEnd',
  ])('rechaza cambio local %s', async (field) => {
    const { local, deps } = setup()
    const manifest = await buildManifest([local], deps.gateway)
    Object.assign(local, { [field]: field.includes('Courts') ? 7 : 'changed' })
    await expect(applyManifest(manifest, deps)).rejects.toThrow()
    expect(deps.gateway.updatePreapprovalAmount).not.toHaveBeenCalled()
  })
  it.each([
    { status: 'paused' },
    { status: 'unknown' },
    { externalReference: 'other' },
    { amountCents: null },
    { amountCents: 14_000_000 },
    { frequency: 12 },
    { nextPaymentDate: null },
    { startDate: null },
    { chargedQuantity: 1 },
    { lastChargedDate: new Date() },
    { lastChargedAmountCents: 16_700_000 },
  ])('rechaza diferencia remota %j incluso si el importe ya coincide', async (patch) => {
    const { local, deps, setRemote } = setup()
    const manifest = await buildManifest([local], deps.gateway)
    setRemote({ amountCents: 15_000_000, ...patch } as Partial<GatewaySubscriptionState>)
    await expect(applyManifest(manifest, deps)).rejects.toThrow()
    expect(deps.gateway.updatePreapprovalAmount).not.toHaveBeenCalled()
  })
  it('frena si cambia una fecha después del PUT', async () => {
    const { local, deps, setRemote } = setup()
    const manifest = await buildManifest([local], deps.gateway)
    deps.gateway.updatePreapprovalAmount.mockImplementationOnce(async () => {
      setRemote({ amountCents: 15_000_000, nextPaymentDate: null })
    })
    await expect(applyManifest(manifest, deps)).rejects.toThrow()
    expect(deps.recordAudit).not.toHaveBeenCalled()
  })
  it.each([null, 14_000_000])(
    'rechaza 404 o descuento previo (%s) desde el inventario',
    async (amount) => {
      const { local, deps, setRemote } = setup()
      if (amount === null) deps.gateway.getSubscriptionState.mockResolvedValue(null)
      else setRemote({ amountCents: amount })
      const manifest = await buildManifest([local], deps.gateway)
      await expect(applyManifest(manifest, deps)).rejects.toThrow()
      expect(deps.gateway.updatePreapprovalAmount).not.toHaveBeenCalled()
    },
  )
  it.each([null, new Date()])(
    'no acepta trial futuro con primer cobro remoto ausente/adelantado %s',
    async (startDate) => {
      const { local, deps, setRemote } = setup()
      setRemote({ startDate })
      const manifest = await buildManifest([local], deps.gateway)
      await expect(applyManifest(manifest, deps)).rejects.toThrow()
      expect(deps.gateway.updatePreapprovalAmount).not.toHaveBeenCalled()
    },
  )
  it.each(['terminal local', 'sin id MP'])('expone %s sin leer MP ni aplicar', async (reason) => {
    const { local, deps } = setup()
    if (reason === 'terminal local') local.status = 'canceled'
    else Object.assign(local, { mpSubscriptionId: null })
    const manifest = await buildManifest([local], deps.gateway)
    expect(manifest.entries[0].skipped).toBe(reason)
    await applyManifest(manifest, deps)
    expect(deps.gateway.getSubscriptionState).not.toHaveBeenCalled()
    expect(deps.gateway.updatePreapprovalAmount).not.toHaveBeenCalled()
  })
  it('audita un importe ya ajustado sin PUT', async () => {
    const { local, deps, setRemote } = setup()
    setRemote({ amountCents: 15_000_000 })
    await applyManifest(await buildManifest([local], deps.gateway), deps)
    expect(deps.gateway.updatePreapprovalAmount).not.toHaveBeenCalled()
    expect(deps.recordAudit).toHaveBeenCalledTimes(1)
  })
  it('rechaza manifiesto manipulado y bloqueo de precio', async () => {
    const { local, deps } = setup()
    const manifest = await buildManifest([local], deps.gateway)
    await expect(
      applyManifest({ ...manifest, entries: [{ ...manifest.entries[0], targetCents: 1 }] }, deps),
    ).rejects.toThrow()
    for (const patch of [{ priceLockedUntil: local.trialEndsAt }]) {
      Object.assign(local, patch)
      const locked = await buildManifest([local], deps.gateway)
      await expect(applyManifest(locked, deps)).rejects.toThrow()
    }
    expect(deps.gateway.updatePreapprovalAmount).not.toHaveBeenCalled()
  })
})
