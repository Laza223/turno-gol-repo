import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  impersonation: vi.fn(),
  limited: vi.fn(),
  own: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  send: vi.fn(),
  status: vi.fn(),
  flag: vi.fn(),
}))
vi.mock('@/modules/staff/guards', () => ({ requireOperatorStaff: mocks.auth }))
vi.mock('@/modules/auth/impersonation.server', () => ({
  getImpersonationSession: mocks.impersonation,
}))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: mocks.limited }))
vi.mock('@/modules/notifications/push-subscription.service', () => ({
  findOwnPushSubscription: mocks.own,
  savePushSubscription: mocks.save,
  deletePushSubscription: mocks.remove,
}))
vi.mock('@/modules/notifications/push.service', () => ({ notifyStaffPush: mocks.send }))
vi.mock('@/modules/notifications/staff-notification.service', () => ({
  getStaffPushDeliveryStatus: mocks.status,
}))
vi.mock('@/shared/feature-flags', () => ({ isFeatureEnabled: mocks.flag }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))
import {
  pushStatusAction,
  subscribePushAction,
  testPushAction,
} from '@/app/(admin)/notificaciones/actions'

const tenant = '11111111-1111-4111-8111-111111111111'
const staff = '22222222-2222-4222-8222-222222222222'
const device = '33333333-3333-4333-8333-333333333333'
const notification = '44444444-4444-4444-8444-444444444444'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({
    ok: true,
    tenant: { id: tenant },
    user: { staffUserId: staff },
    role: 'manager',
  })
  mocks.impersonation.mockResolvedValue(null)
  mocks.limited.mockResolvedValue(null)
  mocks.own.mockResolvedValue(device)
  mocks.flag.mockResolvedValue(true)
  mocks.status.mockResolvedValue({ acceptedAt: null, processedAt: null, openedAt: null })
  mocks.send.mockResolvedValue({ enqueued: 1, notificationId: notification })
})

describe('acciones de notificaciones del dispositivo', () => {
  it('el encargado puede probar su teléfono también en solo lectura', async () => {
    expect(await testPushAction(device)).toEqual({ success: true, notificationId: notification })
    expect(mocks.auth).toHaveBeenCalledWith({ allowReadOnly: true, allowFree: true })
    expect(mocks.send).toHaveBeenCalledWith(
      tenant,
      staff,
      expect.objectContaining({ type: 'test' }),
      device,
    )
  })

  it('impersonación no activa un dispositivo con la identidad prestada', async () => {
    mocks.impersonation.mockResolvedValue({ tenantId: tenant, systemAdminId: 'sa' })
    const result = await subscribePushAction({
      endpoint: 'https://web.push.apple.com/device',
      keys: { p256dh: 'x'.repeat(88), auth: 'x'.repeat(24) },
    })
    expect(result.success).toBe(false)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('rechaza un dispositivo ajeno antes de despachar', async () => {
    mocks.own.mockResolvedValue(null)
    expect((await testPushAction(device)).success).toBe(false)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('un recibo de otra notificación no confirma la prueba', async () => {
    await pushStatusAction(device, notification)
    expect(mocks.status).toHaveBeenCalledWith(tenant, staff, device, notification)
  })

  it('sin flag no consulta columnas de la migración nueva', async () => {
    mocks.flag.mockResolvedValue(false)
    expect(await pushStatusAction(device, notification)).toEqual({
      success: true,
      acceptedAt: null,
      processedAt: null,
      openedAt: null,
    })
    expect(mocks.status).not.toHaveBeenCalled()
  })
})
