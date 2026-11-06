import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  tenants: vi.fn(),
  enabled: vi.fn(),
  agenda: vi.fn(),
  push: vi.fn(),
  email: vi.fn(),
  hoy: vi.fn(),
}))
vi.mock('@/shared/db/client', () => ({
  getWorkerSql: () => mocks.tenants,
  withTenantContext: (_id: string, fn: (tx: object) => unknown) => fn({}),
}))
vi.mock('@/modules/notifications/staff-notification.service', () => ({
  isStaffNotificationsEnabled: mocks.enabled,
}))
vi.mock('@/modules/notifications/staff-agenda.service', () => ({
  enqueueStaffAgendaChange: mocks.agenda,
}))
vi.mock('@/modules/notifications/push.service', () => ({ notifyAdminPush: mocks.push }))
vi.mock('@/modules/notifications/notification.service', () => ({
  enqueueTenantOwnerNotification: mocks.email,
}))
vi.mock('@/modules/home/home.service', () => ({ getHoyData: mocks.hoy }))

import {
  registerDailySummaryWorker,
  runDailySummarySweep,
} from '@/shared/jobs/workers/daily-summary.worker'
import type { PgBoss } from 'pg-boss'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tenants.mockResolvedValue([
    {
      id: 'tenant',
      opening_hours: {},
      closes_next_day: false,
      closed_dates: [],
      daily_summary_email_opt_in: true,
      weekly_summary_email_opt_in: false,
    },
  ])
  mocks.enabled.mockResolvedValue(true)
  mocks.hoy.mockResolvedValue({
    numbers: { collectedTodayCents: 0, occupancy: { occupied: 0, available: 0 } },
  })
})

describe('barrido de agenda y compatibilidad', () => {
  it('v2 procesa agenda sin generar el resumen viejo ni su mail aunque exista opt-in', async () => {
    await runDailySummarySweep()
    expect(mocks.agenda).toHaveBeenCalledWith('tenant', expect.anything())
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.email).not.toHaveBeenCalled()
    expect(mocks.hoy).not.toHaveBeenCalled()
  })

  it('flag apagado conserva el resumen legacy mientras se pilota', async () => {
    mocks.enabled.mockResolvedValue(false)
    await runDailySummarySweep()
    expect(mocks.agenda).not.toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith(
      'tenant',
      expect.objectContaining({ type: 'daily_summary' }),
    )
    expect(mocks.email).toHaveBeenCalledWith(
      expect.objectContaining({ templateName: 'daily_summary' }),
      expect.anything(),
    )
  })

  it('agenda se barre cada minuto y legacy conserva su horario diario', async () => {
    const boss = { schedule: vi.fn(), work: vi.fn() } as unknown as PgBoss
    await registerDailySummaryWorker(boss)
    expect(boss.schedule).toHaveBeenCalledWith('daily-summary', '* * * * *', {})
  })
})
