import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/db/client', () => ({
  getSql: vi.fn(),
}))

vi.mock('@/lib/web-push', () => ({
  sendPushNotification: vi.fn(),
}))

vi.mock('@/shared/observability', () => ({
  track: {
    notification: vi.fn(),
  },
}))

vi.mock('@/shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { getSql } from '@/shared/db/client'
import { sendPushNotification } from '@/lib/web-push'
import { track } from '@/shared/observability'
import { handlePushSendJob } from '@/shared/jobs/workers/push.worker'
import type { Job } from 'pg-boss'
import type { PushSendJobData } from '@/shared/jobs/definitions'

const mockGetSql = getSql as ReturnType<typeof vi.fn>
const mockSendPush = sendPushNotification as ReturnType<typeof vi.fn>
const mockTrack = track as unknown as { notification: ReturnType<typeof vi.fn> }

const SUB_ROW = {
  id: 'sub-uuid-1',
  endpoint: 'https://push.example.com/sub/abc',
  p256dh_key: 'key-p256dh',
  auth_key: 'auth-secret',
}

function makeJob(subscriptionId = 'sub-uuid-1'): Job<PushSendJobData> {
  return {
    id: 'job-1',
    name: 'push-send',
    data: {
      subscription_id: subscriptionId,
      payload: { type: 'booking.confirmed_online', bookingId: 'b-1' },
    },
  } as Job<PushSendJobData>
}

/** Build a sql stub that returns the given rows on the first call (SELECT),
 * and undefined on subsequent calls (UPDATE / DELETE). */
function makeSqlStub(selectRows: unknown[]) {
  let callCount = 0
  const fn = vi.fn(async (..._args: unknown[]) => {
    callCount++
    if (callCount === 1) return selectRows
    return []
  })
  return fn as unknown as ReturnType<typeof getSql>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handlePushSendJob', () => {
  it('returns silently (no throw, no DB write) when subscription row is missing', async () => {
    const sql = makeSqlStub([]) // SELECT returns empty
    mockGetSql.mockReturnValue(sql)

    await expect(handlePushSendJob(makeJob())).resolves.toBeUndefined()

    expect(mockSendPush).not.toHaveBeenCalled()
    // Only one call (the SELECT), no UPDATE/DELETE
    expect(sql).toHaveBeenCalledTimes(1)
  })

  it('calls UPDATE last_used_at on success', async () => {
    const sql = makeSqlStub([SUB_ROW])
    mockGetSql.mockReturnValue(sql)
    mockSendPush.mockResolvedValue({ success: true, statusCode: 201 })

    await handlePushSendJob(makeJob())

    expect(mockSendPush).toHaveBeenCalledWith(
      { endpoint: SUB_ROW.endpoint, keys: { p256dh: SUB_ROW.p256dh_key, auth: SUB_ROW.auth_key } },
      expect.objectContaining({ type: 'booking.confirmed_online' }),
    )
    // Second call is the UPDATE
    expect(sql).toHaveBeenCalledTimes(2)
  })

  it('deletes subscription row and calls track.notification on 410 gone', async () => {
    const sql = makeSqlStub([SUB_ROW])
    mockGetSql.mockReturnValue(sql)
    mockSendPush.mockResolvedValue({ success: false, gone: true, statusCode: 410 })

    await handlePushSendJob(makeJob())

    // Second call is DELETE
    expect(sql).toHaveBeenCalledTimes(2)
    expect(mockTrack.notification).toHaveBeenCalledWith('notification.push.failed', {
      statusCode: 410,
      reason: 'subscription_deleted',
      endpoint: SUB_ROW.endpoint,
    })
  })

  it('throws on non-gone failure so pg-boss retries', async () => {
    const sql = makeSqlStub([SUB_ROW])
    mockGetSql.mockReturnValue(sql)
    mockSendPush.mockResolvedValue({ success: false, gone: false, statusCode: 500, error: 'internal error' })

    await expect(handlePushSendJob(makeJob())).rejects.toThrow(
      /push send failed: statusCode=500/,
    )
  })
})
