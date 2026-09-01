/**
 * Qué HACE el handler con una desvinculación (`application.deauthorized`).
 *
 * El route ya resolvió de qué complejo es (ver
 * `mp-webhook-deauthorized-route.test.ts`). Acá se fija lo que pasa después, y
 * en particular las dos cosas que serían silenciosas si fallaran: que las
 * credenciales se limpien por el MISMO camino que la desvinculación desde la UI
 * (`disconnectMercadoPago`, que además apaga `requires_deposit` — exigir seña
 * sin MercadoPago conectado es F-003 del QA de producción), y que el dueño se
 * entere por mail. Sin el mail, el complejo descubre que dejó de cobrar señas
 * cuando un jugador se lo dice.
 *
 * También fija que NO se resuelva ningún gateway: el token con el que se
 * consultaría a MercadoPago es justamente el que este evento vino a invalidar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  getDb: vi.fn(),
  withTenantContext: vi.fn(),
}))

vi.mock('@/shared/db/client', () => ({
  getDb: h.getDb,
  withTenantContext: h.withTenantContext,
}))
vi.mock('@/modules/payments/mp-oauth', () => ({ resolveTenantGateway: vi.fn() }))
vi.mock('@/modules/payments/payment.service', () => ({
  dispatchPaymentInfo: vi.fn(),
  lockMpEvent: vi.fn().mockResolvedValue(true),
}))
vi.mock('@/modules/billing/dunning.service', () => ({
  onPaymentApproved: vi.fn(),
  onPaymentRejected: vi.fn(),
}))
vi.mock('@/modules/billing/billing.service', () => ({ handleUpgradeApproved: vi.fn() }))
vi.mock('@/modules/billing/billing.gateway', () => ({ getBillingGateway: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({
  disconnectMercadoPago: vi.fn().mockResolvedValue({ mpUserId: '381048203' }),
}))
vi.mock('@/shared/db/audit', () => ({ insertAuditLog: vi.fn() }))
vi.mock('@/modules/notifications/notification.service', () => ({
  dispatchEmail: vi.fn(),
  enqueueTenantOwnerNotification: vi.fn().mockResolvedValue(['notif-1']),
}))
vi.mock('@/modules/notifications/push.service', () => ({ notifyAdminBookingConfirmed: vi.fn() }))
vi.mock('@/shared/observability', () => ({ track: { webhook: vi.fn(), payment: vi.fn() } }))

import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { lockMpEvent } from '@/modules/payments/payment.service'
import { disconnectMercadoPago } from '@/modules/tenants/tenant.service'
import { insertAuditLog } from '@/shared/db/audit'
import {
  dispatchEmail,
  enqueueTenantOwnerNotification,
} from '@/modules/notifications/notification.service'
import { handleMpWebhookJob, type MpWebhookJob } from '@/modules/payments/mp-webhook.handler'

const mockDisconnect = disconnectMercadoPago as ReturnType<typeof vi.fn>
const mockAudit = insertAuditLog as ReturnType<typeof vi.fn>
const mockEnqueue = enqueueTenantOwnerNotification as ReturnType<typeof vi.fn>
const mockDispatchEmail = dispatchEmail as ReturnType<typeof vi.fn>
const mockLockMpEvent = lockMpEvent as ReturnType<typeof vi.fn>
const mockResolveTenantGateway = resolveTenantGateway as ReturnType<typeof vi.fn>
const mockGetBillingGateway = getBillingGateway as ReturnType<typeof vi.fn>

const TENANT_ID = 'tenant-1'

/** `yaVisto` = el evento ya está en `processed_webhooks` (entrega repetida). */
function makeDbChain(yaVisto = false) {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () =>
      Promise.resolve([{ id: TENANT_ID, name: 'Complejo Elite', mpAccessToken: 'token-vivo' }]),
    execute: () => Promise.resolve(yaVisto ? [{ 1: 1 }] : []),
  }
  return chain
}

function job(): MpWebhookJob {
  return {
    tenantId: TENANT_ID,
    mpEventId: 'evt-deauth-1',
    eventType: 'application.deauthorized',
    mpPaymentId: '381048203',
    rawPayload: {
      id: 'evt-deauth-1',
      type: 'application.deauthorized',
      data: { id: '381048203' },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getDb.mockReturnValue(makeDbChain())
  h.withTenantContext.mockImplementation((async (
    _id: string,
    cb: (t: unknown) => Promise<unknown>,
  ) => cb({ execute: vi.fn().mockResolvedValue([]) })) as never)
  mockLockMpEvent.mockResolvedValue(true)
  mockDisconnect.mockResolvedValue({ mpUserId: '381048203' })
  mockEnqueue.mockResolvedValue(['notif-1'])
})

describe('handleMpWebhookJob — desvinculación de MercadoPago', () => {
  it('limpia las credenciales por el mismo camino que la UI y avisa al dueño', async () => {
    await handleMpWebhookJob(job())

    expect(mockDisconnect).toHaveBeenCalledWith(TENANT_ID, expect.anything())

    // Sólo al rol admin: es plata y MP, el mismo criterio con el que
    // `requireAdminStaffAction` le cierra facturación al encargado.
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        templateName: 'admin_mp_disconnected',
        content: { tenantName: 'Complejo Elite' },
      }),
      expect.anything(),
      { onlyRole: 'admin' },
    )
    // Post-commit: la fila tiene que existir cuando el worker de mails la lea.
    expect(mockDispatchEmail).toHaveBeenCalledWith('notif-1')
  })

  it('deja rastro en el audit log, con la cuenta y por dónde entró', async () => {
    await handleMpWebhookJob(job())

    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorType: 'system',
        action: 'tenant.mp_disconnected',
        metadata: expect.objectContaining({
          mpUserId: '381048203',
          origin: 'mp_webhook_deauthorized',
        }),
      }),
    )
  })

  it('NO resuelve ningún gateway: el token que usaría es el que se revocó', async () => {
    await handleMpWebhookJob(job())

    expect(mockResolveTenantGateway).not.toHaveBeenCalled()
    expect(mockGetBillingGateway).not.toHaveBeenCalled()
  })

  it('una entrega repetida no desvincula dos veces ni manda dos mails', async () => {
    // El lock transaccional es la idempotencia real bajo carrera: el pre-check
    // de `processed_webhooks` es best-effort y puede perder la carrera.
    mockLockMpEvent.mockResolvedValue(false)

    await handleMpWebhookJob(job())

    expect(mockDisconnect).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
    expect(mockDispatchEmail).not.toHaveBeenCalled()
  })

  it('el pre-check de duplicados corta antes de tocar nada', async () => {
    h.getDb.mockReturnValue(makeDbChain(true))

    await handleMpWebhookJob(job())

    expect(mockLockMpEvent).not.toHaveBeenCalled()
    expect(mockDisconnect).not.toHaveBeenCalled()
  })
})
