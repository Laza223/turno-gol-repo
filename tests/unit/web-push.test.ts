import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))

vi.mock('@/shared/observability', () => ({
  track: {
    notification: vi.fn(),
  },
}))

vi.mock('@/shared/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import webpush from 'web-push'
import { track } from '@/shared/observability'
import {
  sendPushNotification,
  isAllowedPushEndpoint,
  _resetVapidForTests,
  type PushSubscriptionLike,
  type PushPayload,
} from '@/lib/web-push'

const mockWebpush = webpush as unknown as {
  setVapidDetails: ReturnType<typeof vi.fn>
  sendNotification: ReturnType<typeof vi.fn>
}

const mockTrack = track as unknown as { notification: ReturnType<typeof vi.fn> }

const validSub: PushSubscriptionLike = {
  // Must be an allowlisted push-service host (F6/F10) — a made-up host like
  // push.example.com is exactly what the allowlist now rejects.
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'key1', auth: 'auth1' },
}

const validPayload: PushPayload = {
  type: 'booking.created',
  bookingId: 'b-1',
}

function setVapidEnv() {
  vi.stubEnv('VAPID_SUBJECT', 'mailto:test@turnogol.local')
  vi.stubEnv(
    'VAPID_PUBLIC_KEY',
    'BJzYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  )
  vi.stubEnv('VAPID_PRIVATE_KEY', 'AAAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
}

function clearVapidEnv() {
  vi.stubEnv('VAPID_SUBJECT', undefined)
  vi.stubEnv('VAPID_PUBLIC_KEY', undefined)
  vi.stubEnv('VAPID_PRIVATE_KEY', undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetVapidForTests()
  setVapidEnv()
})

describe('VAPID initialization', () => {
  it('throws if VAPID env vars are missing', async () => {
    clearVapidEnv()
    await expect(sendPushNotification(validSub, validPayload)).rejects.toThrow(
      'VAPID env vars not set',
    )
  })

  it('calls setVapidDetails on first send', async () => {
    mockWebpush.sendNotification.mockResolvedValueOnce({ statusCode: 201 })
    await sendPushNotification(validSub, validPayload)
    expect(mockWebpush.setVapidDetails).toHaveBeenCalledTimes(1)
    expect(mockWebpush.setVapidDetails).toHaveBeenCalledWith(
      'mailto:test@turnogol.local',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    )
  })

  it('does not call setVapidDetails again after first send (_resetVapidForTests resets)', async () => {
    mockWebpush.sendNotification.mockResolvedValue({ statusCode: 201 })
    await sendPushNotification(validSub, validPayload)
    await sendPushNotification(validSub, validPayload)
    // Without reset, second call should not reinitialize
    expect(mockWebpush.setVapidDetails).toHaveBeenCalledTimes(1)
  })

  it('_resetVapidForTests allows re-initialization', async () => {
    mockWebpush.sendNotification.mockResolvedValue({ statusCode: 201 })
    await sendPushNotification(validSub, validPayload)
    _resetVapidForTests()
    await sendPushNotification(validSub, validPayload)
    expect(mockWebpush.setVapidDetails).toHaveBeenCalledTimes(2)
  })
})

describe('payload size limit', () => {
  it('returns size error when payload exceeds 4KB', async () => {
    const bigPayload: PushPayload = {
      type: 'test',
      data: 'x'.repeat(5000),
    }
    const result = await sendPushNotification(validSub, bigPayload)
    expect(result).toEqual({
      success: false,
      gone: false,
      statusCode: 0,
      error: expect.stringMatching(/payload too large/),
    })
    expect(mockWebpush.sendNotification).not.toHaveBeenCalled()
  })

  it('does not reject payload exactly at 4KB boundary', async () => {
    // Build a payload that is exactly 4096 bytes when JSON-stringified
    // type field: '{"type":"t","data":"' = 20 chars, closing '"}'  = 2 chars → 22 overhead
    const dataLen = 4096 - 20 - 2 // exact fit
    const borderPayload: PushPayload = { type: 't', data: 'x'.repeat(dataLen) }
    mockWebpush.sendNotification.mockResolvedValueOnce({ statusCode: 201 })
    const result = await sendPushNotification(validSub, borderPayload)
    expect(result.success).toBe(true)
  })
})

describe('happy path', () => {
  it('returns success with statusCode from web-push', async () => {
    mockWebpush.sendNotification.mockResolvedValueOnce({ statusCode: 201 })
    const result = await sendPushNotification(validSub, validPayload)
    expect(result).toEqual({ success: true, statusCode: 201 })
  })

  it('calls track.notification with notification.push.sent on success', async () => {
    mockWebpush.sendNotification.mockResolvedValueOnce({ statusCode: 201 })
    await sendPushNotification(validSub, validPayload)
    expect(mockTrack.notification).toHaveBeenCalledWith('notification.push.sent', {
      statusCode: 201,
      endpoint: validSub.endpoint,
      payloadType: validPayload.type,
    })
  })

  it('defaults statusCode to 200 when web-push result has no statusCode', async () => {
    mockWebpush.sendNotification.mockResolvedValueOnce({})
    const result = await sendPushNotification(validSub, validPayload)
    expect(result).toEqual({ success: true, statusCode: 200 })
  })
})

describe('endpoint allowlist (F6/F10 SSRF defense)', () => {
  it('isAllowedPushEndpoint accepts known push-service hosts', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true)
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(
      true,
    )
    expect(isAllowedPushEndpoint('https://web.push.apple.com/abc')).toBe(true)
    expect(isAllowedPushEndpoint('https://wns2-abc.notify.windows.com/w/abc')).toBe(true)
  })

  it('isAllowedPushEndpoint rejects an arbitrary host', () => {
    expect(isAllowedPushEndpoint('https://push.example.com/sub/abc')).toBe(false)
  })

  it('isAllowedPushEndpoint rejects a cloud metadata / internal address', () => {
    expect(isAllowedPushEndpoint('http://169.254.169.254/latest/meta-data/')).toBe(false)
  })

  it('isAllowedPushEndpoint rejects http:// even for an allowlisted host', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false)
  })

  it('isAllowedPushEndpoint rejects an unparseable URL', () => {
    expect(isAllowedPushEndpoint('not-a-url')).toBe(false)
  })

  it('sendPushNotification refuses to send to a non-allowlisted endpoint', async () => {
    const sub: PushSubscriptionLike = {
      endpoint: 'http://169.254.169.254/latest/meta-data/',
      keys: { p256dh: 'key1', auth: 'auth1' },
    }
    const result = await sendPushNotification(sub, validPayload)
    expect(result).toEqual({
      success: false,
      gone: false,
      statusCode: 0,
      error: 'endpoint host not allowlisted',
    })
    expect(mockWebpush.sendNotification).not.toHaveBeenCalled()
  })
})

describe('410 gone', () => {
  it('returns gone=true with statusCode 410', async () => {
    mockWebpush.sendNotification.mockRejectedValueOnce({ statusCode: 410, body: 'gone' })
    const result = await sendPushNotification(validSub, validPayload)
    expect(result).toEqual({ success: false, gone: true, statusCode: 410 })
  })

  it('calls track.notification with notification.push.failed and reason=gone', async () => {
    mockWebpush.sendNotification.mockRejectedValueOnce({ statusCode: 410, body: 'gone' })
    await sendPushNotification(validSub, validPayload)
    expect(mockTrack.notification).toHaveBeenCalledWith('notification.push.failed', {
      statusCode: 410,
      reason: 'gone',
      endpoint: validSub.endpoint,
    })
  })
})

describe('5xx errors', () => {
  it('returns gone=false with the error statusCode on 500', async () => {
    mockWebpush.sendNotification.mockRejectedValueOnce({
      statusCode: 500,
      body: 'Internal Server Error',
    })
    const result = await sendPushNotification(validSub, validPayload)
    expect(result).toEqual({
      success: false,
      gone: false,
      statusCode: 500,
      error: 'Internal Server Error',
    })
  })

  it('calls track.notification with notification.push.failed and reason=error on 5xx', async () => {
    mockWebpush.sendNotification.mockRejectedValueOnce({ statusCode: 500 })
    await sendPushNotification(validSub, validPayload)
    expect(mockTrack.notification).toHaveBeenCalledWith('notification.push.failed', {
      statusCode: 500,
      reason: 'error',
      endpoint: validSub.endpoint,
    })
  })

  it('uses message as fallback error when body is absent', async () => {
    mockWebpush.sendNotification.mockRejectedValueOnce({
      statusCode: 503,
      message: 'service unavailable',
    })
    const result = await sendPushNotification(validSub, validPayload)
    expect(result).toMatchObject({
      success: false,
      gone: false,
      statusCode: 503,
      error: 'service unavailable',
    })
  })

  it('uses "unknown" when neither body nor message present', async () => {
    mockWebpush.sendNotification.mockRejectedValueOnce({ statusCode: 502 })
    const result = await sendPushNotification(validSub, validPayload)
    expect(result).toMatchObject({ success: false, gone: false, statusCode: 502, error: 'unknown' })
  })
})
