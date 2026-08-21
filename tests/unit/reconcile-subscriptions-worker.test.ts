import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Fronteras del worker de reconciliación de suscripciones: a quién le pregunta,
 * qué hace cuando MP no reconoce el preapproval, y que en modo mock no salga a
 * la red. La tabla de decisión en sí se cubre en
 * `subscription-reconcile-decision.test.ts`, sobre la función pura.
 */

vi.mock('@/shared/db/client', () => ({
  getWorkerSql: vi.fn(),
  withTenantContext: vi.fn(),
}))
vi.mock('@/modules/billing/billing.gateway', () => ({
  getBillingGateway: vi.fn(),
}))
vi.mock('@/shared/db/audit', () => ({
  insertSystemAuditLog: vi.fn(),
}))
vi.mock('@/modules/notifications/notification.service', () => ({
  enqueueTenantOwnerNotification: vi.fn(),
}))
vi.mock('@/modules/billing/lifecycle.service', () => ({
  transitionTrialingToActive: vi.fn(),
  transitionPastDueToActive: vi.fn(),
  transitionToActiveFromAny: vi.fn(),
}))
vi.mock('@/lib/sentry', () => ({ captureMessage: vi.fn() }))
vi.mock('@/shared/observability', () => ({ track: { payment: vi.fn() } }))
vi.mock('@/shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
// El worker corta antes de tocar MP si el modo mock está prendido; los tests de
// abajo lo quieren APAGADO salvo el último, que lo prende por su cuenta.
vi.mock('@/modules/payments/mock-mp', () => ({ MP_MOCK_ENABLED: false }))

import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { captureMessage } from '@/lib/sentry'
import { reconcileSubscriptions } from '@/shared/jobs/workers/reconcile-subscriptions.worker'

const mockGetWorkerSql = getWorkerSql as ReturnType<typeof vi.fn>
const mockWithTenantContext = withTenantContext as ReturnType<typeof vi.fn>
const mockGetBillingGateway = getBillingGateway as ReturnType<typeof vi.fn>
const mockInsertAudit = insertSystemAuditLog as ReturnType<typeof vi.fn>
const mockCaptureMessage = captureMessage as ReturnType<typeof vi.fn>

const TENANT = 'fbeda410-39eb-4ed0-b248-2f732ad14d26'
const PREAPPROVAL = '275616150bef48aa85d502d9b490a359'

/**
 * Stub del pool de servicio.
 *
 * Despacha por CONTENIDO y no por orden de llamada: `loadCandidates` interpola
 * un fragmento (`sql\`\`` o `sql\`AND ts.updated_at ...\``) que se evalúa ANTES
 * que el template que lo contiene, así que contar llamadas da un orden que no
 * es el que uno leería en el código. Y los dos barridos comparten el MISMO
 * template literal, así que tampoco se distinguen por el texto: lo que los
 * separa es el array de estados interpolado.
 */
function mockWorkerSql(alertRows: unknown[], coreRows: unknown[], postTerminalRows: unknown[]) {
  const stub = vi
    .fn()
    .mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = Array.isArray(strings) ? strings.join(' ') : String(strings)
      if (text.includes('audit_logs')) return alertRows
      if (text.includes('tenant_subscriptions')) {
        const statuses = values[0]
        const esPostTerminal = Array.isArray(statuses) && statuses.includes('blocked')
        return esPostTerminal ? postTerminalRows : coreRows
      }
      return []
    })
  mockGetWorkerSql.mockReturnValue(stub)
  return stub
}

function candidate(over: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    status: 'trialing',
    billingCycle: 'monthly',
    mpSubscriptionId: PREAPPROVAL,
    lastPaymentAt: null,
    ...over,
  }
}

describe('reconcileSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // `withTenantContext` corre el callback con una tx de mentira; los tests de
    // acá no llegan a escribir (el gateway devuelve null o el estado no activa).
    mockWithTenantContext.mockImplementation(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ execute: vi.fn(async () => []) }),
    )
  })

  it('le pregunta a MP por el preapproval que tiene guardado el complejo', async () => {
    mockWorkerSql([], [candidate()], [])
    const getSubscriptionState = vi.fn(async () => null)
    mockGetBillingGateway.mockReturnValue({ getSubscriptionState })

    await reconcileSubscriptions()

    expect(getSubscriptionState).toHaveBeenCalledWith(PREAPPROVAL)
  })

  it('alerta sin escribir nada cuando MP no reconoce el preapproval (404)', async () => {
    mockWorkerSql([], [candidate()], [])
    mockGetBillingGateway.mockReturnValue({ getSubscriptionState: vi.fn(async () => null) })

    const fixed = await reconcileSubscriptions()

    expect(fixed).toBe(0)
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    expect(mockInsertAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'subscription.mp_desync', tenantId: TENANT }),
    )
  })

  it('no repite la alerta de un complejo ya avisado en las últimas 20 h', async () => {
    // El dedup lo alimenta la primera query: `audit_logs` reciente.
    mockWorkerSql([{ resourceId: TENANT }], [candidate()], [])
    mockGetBillingGateway.mockReturnValue({ getSubscriptionState: vi.fn(async () => null) })

    await reconcileSubscriptions()

    expect(mockCaptureMessage).not.toHaveBeenCalled()
    expect(mockInsertAudit).not.toHaveBeenCalled()
  })

  it('también barre los estados post-terminal (suspended/blocked)', async () => {
    const getSubscriptionState = vi.fn(async () => null)
    mockGetBillingGateway.mockReturnValue({ getSubscriptionState })
    mockWorkerSql(
      [],
      [],
      [candidate({ status: 'blocked', mpSubscriptionId: 'preapp-post-terminal' })],
    )

    await reconcileSubscriptions()

    expect(getSubscriptionState).toHaveBeenCalledWith('preapp-post-terminal')
  })

  it('un fallo contra MP en un complejo no frena a los demás', async () => {
    const getSubscriptionState = vi
      .fn()
      .mockRejectedValueOnce(new Error('MP 503'))
      .mockResolvedValueOnce(null)
    mockGetBillingGateway.mockReturnValue({ getSubscriptionState })
    mockWorkerSql(
      [],
      [candidate({ tenantId: 'tenant-a' }), candidate({ tenantId: 'tenant-b' })],
      [],
    )

    await expect(reconcileSubscriptions()).resolves.toBe(0)
    expect(getSubscriptionState).toHaveBeenCalledTimes(2)
  })
})

describe('reconcileSubscriptions en modo mock', () => {
  it('no sale a la red ni consulta la DB', async () => {
    vi.resetModules()
    vi.doMock('@/modules/payments/mock-mp', () => ({ MP_MOCK_ENABLED: true }))

    const { reconcileSubscriptions: enMock } =
      await import('@/shared/jobs/workers/reconcile-subscriptions.worker')
    mockGetWorkerSql.mockClear()
    mockGetBillingGateway.mockClear()

    await expect(enMock()).resolves.toBe(0)
    expect(mockGetWorkerSql).not.toHaveBeenCalled()
    expect(mockGetBillingGateway).not.toHaveBeenCalled()
  })
})
