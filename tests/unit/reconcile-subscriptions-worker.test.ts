import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Fronteras del worker de reconciliación de suscripciones: a quién le pregunta,
 * qué hace cuando MP no reconoce el preapproval, y que en modo mock no salga a
 * la red. La tabla de decisión en sí se cubre en
 * `subscription-reconcile-decision.test.ts`, sobre la función pura.
 */

vi.mock('@/shared/db/client', () => ({
  getWorkerSql: vi.fn(),
  getWorkerDb: vi.fn(() => 'worker-db'),
  withTenantContext: vi.fn(),
}))
vi.mock('@/modules/super-admin/ops-alerts.service', () => ({
  sendOpsAlerts: vi.fn(),
  artHourKey: vi.fn(() => '2026-10-22T14'),
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
import { sendOpsAlerts } from '@/modules/super-admin/ops-alerts.service'
import { reconcileSubscriptions } from '@/shared/jobs/workers/reconcile-subscriptions.worker'

const mockGetWorkerSql = getWorkerSql as ReturnType<typeof vi.fn>
const mockWithTenantContext = withTenantContext as ReturnType<typeof vi.fn>
const mockGetBillingGateway = getBillingGateway as ReturnType<typeof vi.fn>
const mockInsertAudit = insertSystemAuditLog as ReturnType<typeof vi.fn>
const mockCaptureMessage = captureMessage as ReturnType<typeof vi.fn>
const mockSendOpsAlerts = sendOpsAlerts as ReturnType<typeof vi.fn>

const TENANT = 'fbeda410-39eb-4ed0-b248-2f732ad14d26'
const PREAPPROVAL = '275616150bef48aa85d502d9b490a359'

/**
 * Stub del pool de servicio.
 *
 * Despacha por CONTENIDO y no por orden de llamada: `loadCandidates` interpola
 * un fragmento (`sql\`\`` o `sql\`AND ts.updated_at ...\``) que se evalúa ANTES
 * que el template que lo contiene, así que contar llamadas da un orden que no
 * es el que uno leería en el código. Y los TRES barridos comparten el MISMO
 * template literal, así que tampoco se distinguen por el texto: lo que los
 * separa es el array de estados interpolado.
 *
 * Las llamadas a `recentlyAlerted` también comparten template y se separan por
 * la acción interpolada (`subscription.mp_desync`, `subscription.amount_drift`
 * o `subscription.courts_over_billed`).
 *
 * El chequeo de canchas por encima de lo facturado tiene su propia query, que
 * también nombra `tenant_subscriptions`: se la reconoce por el `FROM courts` y
 * se la despacha ANTES, o caería en el barrido núcleo.
 */
function mockWorkerSql(
  alertRows: unknown[],
  coreRows: unknown[],
  postTerminalRows: unknown[],
  activeRows: unknown[] = [],
  amountAlertRows: unknown[] = [],
  overBilledRows: unknown[] = [],
  overBilledAlertRows: unknown[] = [],
) {
  const stub = vi
    .fn()
    .mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = Array.isArray(strings) ? strings.join(' ') : String(strings)
      if (text.includes('audit_logs')) {
        if (values[0] === 'subscription.amount_drift') return amountAlertRows
        if (values[0] === 'subscription.courts_over_billed') return overBilledAlertRows
        return alertRows
      }
      if (text.includes('FROM courts')) return overBilledRows
      // Rescate del pago anual de Plus: estos tests no siembran cotizaciones.
      if (text.includes('plus_prorate_cents')) return []
      if (text.includes('tenant_subscriptions')) {
        const statuses = values[0]
        if (Array.isArray(statuses) && statuses.includes('active')) return activeRows
        const esPostTerminal = Array.isArray(statuses) && statuses.includes('blocked')
        return esPostTerminal ? postTerminalRows : coreRows
      }
      return []
    })
  mockGetWorkerSql.mockReturnValue(stub)
  return stub
}

/**
 * Una cancha, mensual: $47.000. El JOIN con `plans` trae los parámetros de la
 * regla lineal (migr. 090), no un precio fijo — el monto esperado se calcula
 * sobre `billedCourts`.
 */
function candidate(over: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    status: 'trialing',
    billingCycle: 'monthly',
    mpSubscriptionId: PREAPPROVAL,
    lastPaymentAt: null,
    billedCourts: 1,
    plusEnabled: false,
    plusPricePerCourtCents: null,
    plusAccessUntil: null,
    priceFirstCourtCents: 4_700_000,
    priceExtraCourtCents: 3_000_000,
    annualDiscountBps: 1_000,
    ...over,
  }
}

/**
 * Estado remoto `authorized` con el monto que se le quiera dar. Los campos que
 * no toca el chequeo de monto van en su valor neutro: `decideSubscriptionReconcile`
 * no activa nada sin `lastChargedDate`, que es justo lo que queremos acá.
 */
function remoteAuthorized(amountCents: number | null) {
  return {
    preapprovalId: PREAPPROVAL,
    status: 'authorized' as const,
    externalReference: TENANT,
    nextPaymentDate: null,
    chargedQuantity: 0,
    lastChargedDate: null,
    lastChargedAmountCents: null,
    amountCents,
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

/**
 * 🔴 3 de la revisión de la tanda #319-#324
 * (`docs/audit/2026-09-16-revision-tanda-319-324.md`).
 *
 * Un preapproval autorizado ANTES del fix de #319 puede estar cobrando
 * `price_annual` (el equivalente mensual con 20% off) en vez de
 * `price_annual * 12`, o sea 1/12 de lo que corresponde, para siempre. El
 * complejo está `active` y paga feliz, así que ninguno de los dos barridos de
 * rescate lo mira nunca.
 *
 * La tabla de decisión pura vive en `subscription-reconcile-decision.test.ts`;
 * acá se prueba el cableado del worker: a quién le pregunta, qué escribe, y que
 * NO toque nada.
 */
describe('reconcileSubscriptions — desfasaje de monto del preapproval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendOpsAlerts.mockResolvedValue([])
    mockWithTenantContext.mockImplementation(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ execute: vi.fn(async () => []) }),
    )
  })

  const anual = candidate({ status: 'active', billingCycle: 'annual' })

  it('alerta cuando MP va a cobrar 1/12 de lo que vale el año', async () => {
    mockWorkerSql([], [], [], [anual])
    // El bug que este chequeo caza: mandarle a MP el equivalente MENSUAL con
    // descuento ($42.300) cuando el preapproval anual cobra una vez al año y
    // corresponde ese número × 12.
    mockGetBillingGateway.mockReturnValue({
      getSubscriptionState: vi.fn(async () => remoteAuthorized(4_230_000)),
    })

    await reconcileSubscriptions()

    expect(mockInsertAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'subscription.amount_drift',
        tenantId: TENANT,
        metadata: expect.objectContaining({
          billingCycle: 'annual',
          expectedCents: 4_230_000 * 12,
          actualCents: 4_230_000,
        }),
      }),
    )
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
  })

  it('NO corrige nada: sólo deja el rastro', async () => {
    const gateway = {
      getSubscriptionState: vi.fn(async () => remoteAuthorized(5_040_000)),
      updatePreapprovalAmount: vi.fn(),
      cancelPreapproval: vi.fn(),
    }
    mockWorkerSql([], [], [], [anual])
    mockGetBillingGateway.mockReturnValue(gateway)

    await reconcileSubscriptions()

    // Opción 1 de las tres del informe: cambiarle el monto a un preapproval que
    // el cliente ya autorizó es una decisión del dueño, no del cron.
    expect(gateway.updatePreapprovalAmount).not.toHaveBeenCalled()
    expect(gateway.cancelPreapproval).not.toHaveBeenCalled()
  })

  it('el monto correcto no alerta', async () => {
    mockWorkerSql([], [], [], [anual])
    mockGetBillingGateway.mockReturnValue({
      getSubscriptionState: vi.fn(async () => remoteAuthorized(4_230_000 * 12)),
    })

    await reconcileSubscriptions()

    expect(mockInsertAudit).not.toHaveBeenCalled()
    expect(mockCaptureMessage).not.toHaveBeenCalled()
  })

  // DR1/DR2 — TurnoGol Plus: el monto esperado suma Plus SOLO si `plus_enabled`
  // (con su precio especial si lo hay). Una cotización anual pendiente o una baja
  // agendada tienen `plus_enabled = false`: el débito vigente no lleva Plus.
  describe('con TurnoGol Plus', () => {
    // 1 cancha mensual a $47.000 (fixture): plan 4.700.000.
    const PLAN_ONLY = 4_700_000
    const withPlus = (over: Record<string, unknown>) =>
      candidate({ status: 'active', billingCycle: 'monthly', ...over })

    async function run(cand: ReturnType<typeof candidate>, remoteCents: number) {
      mockWorkerSql([], [], [], [cand])
      mockGetBillingGateway.mockReturnValue({
        getSubscriptionState: vi.fn(async () => remoteAuthorized(remoteCents)),
      })
      await reconcileSubscriptions()
    }

    it('Plus prendido y el débito de MP lleva solo el plan: alerta con el esperado CON Plus', async () => {
      await run(withPlus({ plusEnabled: true }), PLAN_ONLY)

      expect(mockInsertAudit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'subscription.amount_drift',
          metadata: expect.objectContaining({
            expectedCents: PLAN_ONLY + 2_000_000,
            actualCents: PLAN_ONLY,
          }),
        }),
      )
      // Con Plus el drift además avisa por mail al dueño de TurnoGol.
      expect(mockSendOpsAlerts).toHaveBeenCalledTimes(1)
      const [, alerts, link] = mockSendOpsAlerts.mock.calls[0] as [
        unknown,
        Array<{ key: string; subject: string }>,
        { path: string },
      ]
      expect(alerts[0]?.key).toBe(`plus-amount-drift:${TENANT}:2026-10-22T14`)
      expect(alerts[0]?.subject).toContain('el débito de MercadoPago no refleja TurnoGol Plus')
      expect(link.path).toBe(`/super-admin/tenants/${TENANT}`)
    })

    it('baja agendada (plus_access_until) con drift: también avisa por mail', async () => {
      await run(
        withPlus({ plusEnabled: false, plusAccessUntil: '2027-01-01T00:00:00Z' }),
        PLAN_ONLY + 2_000_000,
      )

      expect(mockSendOpsAlerts).toHaveBeenCalledTimes(1)
    })

    it('si el mail no sale no escribe el audit (el próximo tick reintenta)', async () => {
      mockSendOpsAlerts.mockResolvedValue(['plus-amount-drift'])

      await run(withPlus({ plusEnabled: true }), PLAN_ONLY)

      expect(mockInsertAudit).not.toHaveBeenCalled()
    })

    it('sin Plus el drift sigue sin mail', async () => {
      await run(withPlus({ plusEnabled: false }), PLAN_ONLY + 2_000_000)

      expect(mockInsertAudit).toHaveBeenCalledTimes(1)
      expect(mockSendOpsAlerts).not.toHaveBeenCalled()
    })

    it('Plus prendido y el débito ya lo lleva: sin alerta', async () => {
      await run(withPlus({ plusEnabled: true }), PLAN_ONLY + 2_000_000)

      expect(mockInsertAudit).not.toHaveBeenCalled()
      expect(mockCaptureMessage).not.toHaveBeenCalled()
    })

    it('usa el precio especial y no el de lista', async () => {
      await run(
        withPlus({ plusEnabled: true, plusPricePerCourtCents: 1_000_000 }),
        PLAN_ONLY + 1_000_000,
      )
      expect(mockInsertAudit).not.toHaveBeenCalled()

      vi.clearAllMocks()
      await run(
        withPlus({ plusEnabled: true, plusPricePerCourtCents: 1_000_000 }),
        PLAN_ONLY + 2_000_000,
      )
      expect(mockInsertAudit).toHaveBeenCalledTimes(1)
    })

    it('baja aplicada en la base pero MP todavía cobra Plus: alerta', async () => {
      await run(withPlus({ plusEnabled: false }), PLAN_ONLY + 2_000_000)

      expect(mockInsertAudit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'subscription.amount_drift',
          metadata: expect.objectContaining({ expectedCents: PLAN_ONLY }),
        }),
      )
    })

    it('cotización anual pendiente (plus_enabled = false con precio guardado) y débito solo-plan: sin alerta', async () => {
      await run(withPlus({ plusEnabled: false, plusPricePerCourtCents: 1_500_000 }), PLAN_ONLY)

      expect(mockInsertAudit).not.toHaveBeenCalled()
      expect(mockCaptureMessage).not.toHaveBeenCalled()
    })
  })

  it('no repite la alerta de un complejo ya avisado en las últimas 20 h', async () => {
    mockWorkerSql([], [], [], [anual], [{ resourceId: TENANT }])
    mockGetBillingGateway.mockReturnValue({
      getSubscriptionState: vi.fn(async () => remoteAuthorized(5_040_000)),
    })

    await reconcileSubscriptions()

    expect(mockInsertAudit).not.toHaveBeenCalled()
    expect(mockCaptureMessage).not.toHaveBeenCalled()
  })

  it('un fallo contra MP en el chequeo de monto no frena a los demás', async () => {
    const getSubscriptionState = vi
      .fn()
      .mockRejectedValueOnce(new Error('MP 503'))
      .mockResolvedValueOnce(remoteAuthorized(5_040_000))
    mockGetBillingGateway.mockReturnValue({ getSubscriptionState })
    mockWorkerSql(
      [],
      [],
      [],
      [
        candidate({ tenantId: 'tenant-a', status: 'active', billingCycle: 'annual' }),
        candidate({ tenantId: 'tenant-b', status: 'active', billingCycle: 'annual' }),
      ],
    )

    await reconcileSubscriptions()

    expect(getSubscriptionState).toHaveBeenCalledTimes(2)
    expect(mockInsertAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'subscription.amount_drift', tenantId: 'tenant-b' }),
    )
  })

  it('aprovecha la respuesta que el barrido núcleo ya le pidió a MP, sin un segundo viaje', async () => {
    const getSubscriptionState = vi.fn(async () => remoteAuthorized(5_040_000))
    mockGetBillingGateway.mockReturnValue({ getSubscriptionState })
    // El candidato está en `trialing`, así que lo levanta el barrido núcleo y
    // NO aparece en el de `active`.
    mockWorkerSql([], [candidate({ billingCycle: 'annual' })], [], [])

    await reconcileSubscriptions()

    expect(getSubscriptionState).toHaveBeenCalledTimes(1)
    expect(mockInsertAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'subscription.amount_drift' }),
    )
  })
})

/**
 * Canchas prendidas por encima de lo facturado
 * (`docs/decisions/2026-10-22-cancha-en-mora.md`).
 *
 * La condición (qué estados, qué cuenta como cancha prendida, cuándo un cambio
 * agendado ya lo cubre) vive en el SQL y se prueba contra DB real en
 * `tests/integration/courts-over-billed.test.ts`. Acá, el cableado: qué deja,
 * a quién avisa, el dedup y que no toque nada.
 */
describe('reconcileSubscriptions — canchas por encima de lo facturado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithTenantContext.mockImplementation(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ execute: vi.fn(async () => []) }),
    )
    mockSendOpsAlerts.mockResolvedValue([])
  })

  function fila(over: Record<string, unknown> = {}) {
    return {
      tenantId: TENANT,
      tenantName: 'Complejo Norte',
      billedCourts: 2,
      onlineCourts: 3,
      ...over,
    }
  }

  it('deja el rastro, avisa a Sentry y manda el mail de ops, sin preguntarle a MP', async () => {
    mockWorkerSql([], [], [], [], [], [fila()])

    const fixed = await reconcileSubscriptions()

    // Avisar no levanta ninguna suscripción.
    expect(fixed).toBe(0)
    expect(mockInsertAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'subscription.courts_over_billed',
        tenantId: TENANT,
        resourceId: TENANT,
        metadata: { billedCourts: 2, onlineCourts: 3 },
      }),
    )
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    expect(mockSendOpsAlerts).toHaveBeenCalledTimes(1)
    expect(mockSendOpsAlerts).toHaveBeenCalledWith(
      'worker-db',
      [
        expect.objectContaining({
          key: `courts-over-billed:${TENANT}:2026-10-22T14`,
          subject: expect.stringContaining('Complejo Norte'),
        }),
      ],
      expect.objectContaining({ path: `/super-admin/tenants/${TENANT}` }),
    )
    // Pura DB: ni el estado del preapproval ni el monto.
    expect(mockGetBillingGateway).not.toHaveBeenCalled()
  })

  it('no repite la alerta de un complejo ya avisado en las últimas 20 h', async () => {
    mockWorkerSql([], [], [], [], [], [fila()], [{ resourceId: TENANT }])

    await reconcileSubscriptions()

    expect(mockInsertAudit).not.toHaveBeenCalled()
    expect(mockCaptureMessage).not.toHaveBeenCalled()
    expect(mockSendOpsAlerts).not.toHaveBeenCalled()
  })

  it('el dedup es por acción: una alerta de monto reciente no la apaga', async () => {
    mockWorkerSql([{ resourceId: TENANT }], [], [], [], [{ resourceId: TENANT }], [fila()])

    await reconcileSubscriptions()

    expect(mockSendOpsAlerts).toHaveBeenCalledTimes(1)
  })

  it('si el mail no le llega a nadie, no deja el rastro: el próximo tick reintenta', async () => {
    mockWorkerSql([], [], [], [], [], [fila()])
    mockSendOpsAlerts.mockResolvedValueOnce([`courts-over-billed:${TENANT}:2026-10-22T14`])

    await expect(reconcileSubscriptions()).resolves.toBe(0)

    // El rastro es el dedup de 20 h: escribirlo sin mail gastaría el aviso.
    expect(mockInsertAudit).not.toHaveBeenCalled()
    // Sentry queda de respaldo mientras el mail no sale.
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
  })

  it('un fallo al avisar de un complejo no frena a los demás', async () => {
    mockWorkerSql(
      [],
      [],
      [],
      [],
      [],
      [fila({ tenantId: 'tenant-a' }), fila({ tenantId: 'tenant-b' })],
    )
    mockSendOpsAlerts.mockRejectedValueOnce(new Error('DB caída'))

    await expect(reconcileSubscriptions()).resolves.toBe(0)

    expect(mockSendOpsAlerts).toHaveBeenCalledTimes(2)
    expect(mockInsertAudit).toHaveBeenCalledTimes(1)
    expect(mockInsertAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'subscription.courts_over_billed', tenantId: 'tenant-b' }),
    )
  })
  it('un fallo al leer las cotizaciones de Plus no frena el chequeo de canchas', async () => {
    const stub = mockWorkerSql([], [], [], [], [], [fila()])
    const base = stub.getMockImplementation()
    stub.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (Array.isArray(strings) && strings.join(' ').includes('plus_prorate_cents')) {
        throw new Error('DB caída')
      }
      return base?.(strings, ...values)
    })

    await expect(reconcileSubscriptions()).resolves.toBe(0)

    expect(mockSendOpsAlerts).toHaveBeenCalledTimes(1)
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
