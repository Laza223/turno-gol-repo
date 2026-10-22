import { beforeEach, describe, expect, it, vi } from 'vitest'

// La desvinculación (`mp-connect`) no se toma como verdad: el handler intenta
// renovar el token del complejo y el veredicto es de MercadoPago. Quién marca
// es `refreshTenantMpToken` (cubierto en la integración); acá se cuida el
// orden: comprobar → recién ahí registrar el evento, y que un error transitorio
// tire para que pg-boss reintente. Spec:
// `docs/superpowers/specs/2026-10-22-aviso-mp-desconectado-design.md`.

const h = vi.hoisted(() => ({
  getDb: vi.fn(),
  withTenantContext: vi.fn(),
  refreshTenantMpToken: vi.fn(),
  lockMpEvent: vi.fn(),
  dispatchPaymentInfo: vi.fn(),
  resolveTenantGateway: vi.fn(),
}))

vi.mock('@/shared/db/client', () => ({
  getDb: h.getDb,
  withTenantContext: h.withTenantContext,
}))
vi.mock('@/modules/payments/mp-oauth', () => ({
  resolveTenantGateway: h.resolveTenantGateway,
  refreshTenantMpToken: h.refreshTenantMpToken,
}))
vi.mock('@/modules/payments/payment.service', () => ({
  dispatchPaymentInfo: h.dispatchPaymentInfo,
  lockMpEvent: h.lockMpEvent,
}))
vi.mock('@/modules/billing/dunning.service', () => ({
  onPaymentApproved: vi.fn(),
  onPaymentRejected: vi.fn(),
}))
vi.mock('@/modules/billing/billing.service', () => ({
  handleUpgradeApproved: vi.fn(),
}))
vi.mock('@/modules/billing/billing.gateway', () => ({
  getBillingGateway: vi.fn(),
}))
vi.mock('@/modules/notifications/notification.service', () => ({
  dispatchEmail: vi.fn(),
}))
vi.mock('@/modules/notifications/push.service', () => ({
  notifyAdminBookingConfirmed: vi.fn(),
}))
vi.mock('@/shared/observability', () => ({
  track: { webhook: vi.fn(), payment: vi.fn() },
}))

import { MpGatewayError, MpGrantRevokedError } from '@/modules/payments/payment.errors'
import { handleMpWebhookJob, type MpWebhookJob } from '@/modules/payments/mp-webhook.handler'

const TENANT_ID = 'tenant-1'
const CUENTA = '123456789'

/** `getDb()` para el SELECT del complejo y el pre-check de `processed_webhooks`. */
function mockDb(
  tenantRow: { mpRefreshToken: string | null; mpUserId: string | null } | null,
  yaProcesado = false,
) {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () =>
      Promise.resolve(
        tenantRow ? [{ id: TENANT_ID, mpAccessToken: 'encrypted-access', ...tenantRow }] : [],
      ),
    execute: () => Promise.resolve(yaProcesado ? [{ '?column?': 1 }] : []),
  }
  h.getDb.mockReturnValue(chain)
}

const job: MpWebhookJob = {
  tenantId: TENANT_ID,
  mpEventId: 'evt-connect-1',
  eventType: 'mp-connect',
  mpPaymentId: CUENTA,
  rawPayload: { type: 'mp-connect', action: 'application.deauthorized' },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb({ mpRefreshToken: 'encrypted-refresh', mpUserId: CUENTA })
  h.withTenantContext.mockImplementation((async (_id: string, cb: (t: unknown) => unknown) =>
    cb({})) as never)
  h.lockMpEvent.mockResolvedValue(true)
  h.refreshTenantMpToken.mockResolvedValue('encrypted-new-access')
})

describe('handleMpWebhookJob — mp-connect', () => {
  it('comprueba con un refresh marcado como "webhook" y después registra el evento', async () => {
    await handleMpWebhookJob(job)

    expect(h.refreshTenantMpToken).toHaveBeenCalledWith(TENANT_ID, 'webhook')
    expect(h.lockMpEvent).toHaveBeenCalledWith(
      expect.objectContaining({ mpEventId: 'evt-connect-1', eventType: 'mp-connect' }),
      expect.anything(),
    )
    // El orden importa: registrar antes de comprobar perdería el reintento.
    expect(h.refreshTenantMpToken.mock.invocationCallOrder[0]).toBeLessThan(
      h.lockMpEvent.mock.invocationCallOrder[0]!,
    )
    // No es un pago: nunca se consulta a MP por un payment.
    expect(h.resolveTenantGateway).not.toHaveBeenCalled()
    expect(h.dispatchPaymentInfo).not.toHaveBeenCalled()
  })

  it('una revocación ya quedó marcada: registra el evento y no tira', async () => {
    h.refreshTenantMpToken.mockRejectedValue(new MpGrantRevokedError('invalid_grant', 400))

    await expect(handleMpWebhookJob(job)).resolves.toBeUndefined()
    expect(h.lockMpEvent).toHaveBeenCalledTimes(1)
  })

  it('un error transitorio tira y NO registra el evento, para que pg-boss reintente', async () => {
    h.refreshTenantMpToken.mockRejectedValue(
      new MpGatewayError('MP token refresh failed (HTTP 503)'),
    )

    await expect(handleMpWebhookJob(job)).rejects.toBeInstanceOf(MpGatewayError)
    expect(h.lockMpEvent).not.toHaveBeenCalled()
  })

  it('si el complejo reconectó con OTRA cuenta, el aviso es viejo: no refresca', async () => {
    mockDb({ mpRefreshToken: 'encrypted-refresh', mpUserId: '999999999' })

    await handleMpWebhookJob(job)

    expect(h.refreshTenantMpToken).not.toHaveBeenCalled()
    expect(h.lockMpEvent).toHaveBeenCalledTimes(1)
  })

  it('sin refresh token (ya desconectó desde TurnoGol) no hay nada que comprobar', async () => {
    mockDb({ mpRefreshToken: null, mpUserId: null })

    await handleMpWebhookJob(job)

    expect(h.refreshTenantMpToken).not.toHaveBeenCalled()
    expect(h.lockMpEvent).toHaveBeenCalledTimes(1)
  })

  it('una entrega repetida corta en el pre-check, sin refrescar', async () => {
    mockDb({ mpRefreshToken: 'encrypted-refresh', mpUserId: CUENTA }, true)

    await handleMpWebhookJob(job)

    expect(h.refreshTenantMpToken).not.toHaveBeenCalled()
    expect(h.lockMpEvent).not.toHaveBeenCalled()
  })
})
