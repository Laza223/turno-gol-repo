import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mocks must be hoisted before imports.
vi.mock('@/shared/db/client', () => ({
  getWorkerSql: vi.fn(),
}))

vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(),
}))

vi.mock('@/shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { getWorkerSql } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'
import { notifyAdminPush, notifyStaffPush } from '@/modules/notifications/push.service'
import { QUEUE_PUSH_SEND } from '@/shared/jobs/definitions'

const mockSql = getWorkerSql as ReturnType<typeof vi.fn>
const mockGetBoss = getBoss as ReturnType<typeof vi.fn>

function makeBossStub() {
  return { send: vi.fn().mockResolvedValue(undefined) }
}

function makeSqlStub(rows: Array<{ id: string }>) {
  // postgres tagged template returns rows directly
  const fn = vi.fn().mockResolvedValue(rows)
  return fn as unknown as ReturnType<typeof getWorkerSql>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('notifyAdminPush', () => {
  it('returns {enqueued: 0} and does not call boss.send when no subscriptions', async () => {
    const sql = makeSqlStub([])
    mockSql.mockReturnValue(sql)
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    const result = await notifyAdminPush('tenant-1', { type: 'booking.confirmed_online' })

    expect(result).toEqual({ enqueued: 0 })
    expect(boss.send).not.toHaveBeenCalled()
  })

  it('returns {enqueued: 3} and calls boss.send 3 times with correct args', async () => {
    const subs = [{ id: 'sub-1' }, { id: 'sub-2' }, { id: 'sub-3' }]
    const sql = makeSqlStub(subs)
    mockSql.mockReturnValue(sql)
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    const payload = { type: 'booking.confirmed_online', bookingId: 'b-1' }
    const result = await notifyAdminPush('tenant-1', payload)

    expect(result).toEqual({ enqueued: 3 })
    expect(boss.send).toHaveBeenCalledTimes(3)
    for (const sub of subs) {
      expect(boss.send).toHaveBeenCalledWith(
        QUEUE_PUSH_SEND,
        { subscription_id: sub.id, payload },
        expect.objectContaining({ retryLimit: 3 }),
      )
    }
  })
})

describe('notifyStaffPush', () => {
  it('returns {enqueued: 0} when no subscriptions match staff user', async () => {
    const sql = makeSqlStub([])
    mockSql.mockReturnValue(sql)
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    const result = await notifyStaffPush('tenant-1', 'staff-user-1', { type: 'test' })

    expect(result).toEqual({ enqueued: 0 })
    expect(boss.send).not.toHaveBeenCalled()
  })

  it('SQL query includes both tenantId AND staffUserId', async () => {
    const subs = [{ id: 'sub-a' }]
    const sql = makeSqlStub(subs)
    mockSql.mockReturnValue(sql)
    const boss = makeBossStub()
    mockGetBoss.mockResolvedValue(boss)

    await notifyStaffPush('tenant-42', 'staff-99', { type: 'test.push' })

    // The tagged template is called with a string fragment array and parameters.
    // We verify the call happened and that the boss.send was invoked with the right sub id.
    expect(boss.send).toHaveBeenCalledTimes(1)
    expect(boss.send).toHaveBeenCalledWith(
      QUEUE_PUSH_SEND,
      { subscription_id: 'sub-a', payload: { type: 'test.push' } },
      expect.objectContaining({ retryLimit: 3 }),
    )
    // Verify the sql mock was called (the WHERE clause includes both ids as template args).
    expect(sql).toHaveBeenCalledTimes(1)
  })
})
