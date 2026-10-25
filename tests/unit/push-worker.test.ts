import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/db/client', () => ({
  getWorkerSql: vi.fn(),
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
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { getWorkerSql } from '@/shared/db/client'
import { sendPushNotification } from '@/lib/web-push'
import { track } from '@/shared/observability'
import { handlePushSendJob } from '@/shared/jobs/workers/push.worker'
import type { Job } from 'pg-boss'
import type { PushSendJobData } from '@/shared/jobs/definitions'

const mockGetSql = getWorkerSql as ReturnType<typeof vi.fn>
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
  return fn as unknown as ReturnType<typeof getWorkerSql>
}

/** Build a sql stub that returns `results[i]` for the i-th call (0-indexed),
 * or [] once `results` is exhausted. Used for the F3 dedupeKey tests, where
 * the SELECT (subscription lookup) and the claim (push_send_log INSERT ...
 * ON CONFLICT DO NOTHING) need independently controlled return rows. */
function makeSqlSequence(results: unknown[][]) {
  let callCount = 0
  const fn = vi.fn(async (..._args: unknown[]) => {
    const result = results[callCount] ?? []
    callCount++
    return result
  })
  return fn as unknown as ReturnType<typeof getWorkerSql>
}

function makeJobWithDedupe(dedupeKey: string, subscriptionId = 'sub-uuid-1'): Job<PushSendJobData> {
  return {
    id: 'job-dedupe-1',
    name: 'push-send',
    data: {
      subscription_id: subscriptionId,
      payload: { type: 'booking.confirmed_online', bookingId: 'b-1' },
      dedupeKey,
    },
  } as Job<PushSendJobData>
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
    mockSendPush.mockResolvedValue({
      success: false,
      gone: false,
      statusCode: 500,
      error: 'internal error',
    })

    await expect(handlePushSendJob(makeJob())).rejects.toThrow(/push send failed: statusCode=500/)
  })

  // ─── F3 (hallazgo D4): idempotencia por dedupeKey ────────────────────
  describe('con dedupeKey (F3)', () => {
    it('claim ya reclamado (ON CONFLICT DO NOTHING sin RETURNING): no reenvía, no throws', async () => {
      // Llamada 1 = SELECT subscription (encontrada); llamada 2 = claim en
      // push_send_log, vacío = otro job ya lo reclamó primero.
      const sql = makeSqlSequence([[SUB_ROW], []])
      mockGetSql.mockReturnValue(sql)

      await expect(
        handlePushSendJob(makeJobWithDedupe('push:booking-confirmed:b-1:sub-uuid-1')),
      ).resolves.toBeUndefined()

      expect(mockSendPush).not.toHaveBeenCalled()
      // Solo SELECT + claim — sin UPDATE/DELETE posterior (nunca llegó a enviar).
      expect(sql).toHaveBeenCalledTimes(2)
    })

    it('claim libre (INSERT ... ON CONFLICT DO NOTHING RETURNING con fila): reclama y SÍ envía', async () => {
      const sql = makeSqlSequence([
        [SUB_ROW],
        [{ dedupe_key: 'push:booking-confirmed:b-1:sub-uuid-1' }],
      ])
      mockGetSql.mockReturnValue(sql)
      mockSendPush.mockResolvedValue({ success: true, statusCode: 201 })

      await handlePushSendJob(makeJobWithDedupe('push:booking-confirmed:b-1:sub-uuid-1'))

      expect(mockSendPush).toHaveBeenCalledTimes(1)
      // SELECT + claim + UPDATE last_used_at.
      expect(sql).toHaveBeenCalledTimes(3)
    })
  })

  // El claim es at-most-once, pero un fallo de envío no es un crash: si el claim
  // sobrevive, el reintento de pg-boss lo ve y sale en silencio — push perdido.
  describe('con dedupeKey: el claim no sobrevive a un fallo reintentable', () => {
    const KEY = 'push:booking-confirmed:b-1:sub-uuid-1'
    const CLAIMED = [{ dedupe_key: KEY }]
    const statements = (sql: unknown) =>
      (sql as { mock: { calls: unknown[][] } }).mock.calls.map((c) =>
        (c[0] as readonly string[]).join('?').replace(/\s+/g, ' ').trim(),
      )

    it('error no-gone del proveedor: libera el claim y relanza (el reintento SÍ reenvía)', async () => {
      const sql = makeSqlSequence([[SUB_ROW], CLAIMED])
      mockGetSql.mockReturnValue(sql)
      mockSendPush.mockResolvedValue({
        success: false,
        gone: false,
        statusCode: 503,
        error: 'unavailable',
      })

      await expect(handlePushSendJob(makeJobWithDedupe(KEY))).rejects.toThrow(/statusCode=503/)

      expect(statements(sql)[2]).toBe('DELETE FROM push_send_log WHERE dedupe_key = ?')
      expect((sql as unknown as { mock: { calls: unknown[][] } }).mock.calls[2]![1]).toBe(KEY)
    })

    it('sendPushNotification tira (ej. VAPID sin configurar): libera el claim y relanza', async () => {
      const sql = makeSqlSequence([[SUB_ROW], CLAIMED])
      mockGetSql.mockReturnValue(sql)
      mockSendPush.mockRejectedValue(new Error('VAPID env vars not set'))

      await expect(handlePushSendJob(makeJobWithDedupe(KEY))).rejects.toThrow(/VAPID/)

      expect(statements(sql)[2]).toBe('DELETE FROM push_send_log WHERE dedupe_key = ?')
    })

    it('si el DELETE del claim también falla: se relanza el error ORIGINAL del envío', async () => {
      let n = 0
      const sql = vi.fn(async (..._args: unknown[]) => {
        n++
        if (n === 1) return [SUB_ROW]
        if (n === 2) return CLAIMED
        throw new Error('db caída en el DELETE')
      }) as unknown as ReturnType<typeof getWorkerSql>
      mockGetSql.mockReturnValue(sql)
      mockSendPush.mockResolvedValue({
        success: false,
        gone: false,
        statusCode: 503,
        error: 'unavailable',
      })

      await expect(handlePushSendJob(makeJobWithDedupe(KEY))).rejects.toThrow(/statusCode=503/)
    })

    it('410 (suscripción muerta): conserva el claim, solo borra la suscripción', async () => {
      const sql = makeSqlSequence([[SUB_ROW], CLAIMED])
      mockGetSql.mockReturnValue(sql)
      mockSendPush.mockResolvedValue({ success: false, gone: true, statusCode: 410 })

      await handlePushSendJob(makeJobWithDedupe(KEY))

      const all = statements(sql)
      expect(all).toHaveLength(3)
      expect(all[2]).toBe('DELETE FROM push_subscriptions WHERE id = ?')
      expect(all.some((s) => s.includes('push_send_log WHERE'))).toBe(false)
    })

    it('sin dedupeKey y con fallo: no toca push_send_log', async () => {
      const sql = makeSqlStub([SUB_ROW])
      mockGetSql.mockReturnValue(sql)
      mockSendPush.mockResolvedValue({
        success: false,
        gone: false,
        statusCode: 500,
        error: 'boom',
      })

      await expect(handlePushSendJob(makeJob())).rejects.toThrow(/statusCode=500/)

      expect(sql).toHaveBeenCalledTimes(1)
    })
  })

  describe('sin dedupeKey (comportamiento viejo, sin guard)', () => {
    it('no consulta push_send_log: SELECT + envío directo, igual que antes de F3', async () => {
      const sql = makeSqlStub([SUB_ROW])
      mockGetSql.mockReturnValue(sql)
      mockSendPush.mockResolvedValue({ success: true, statusCode: 201 })

      await handlePushSendJob(makeJob())

      expect(mockSendPush).toHaveBeenCalledTimes(1)
      // SELECT + UPDATE last_used_at — sin el paso de claim de en medio.
      expect(sql).toHaveBeenCalledTimes(2)
    })
  })
})
