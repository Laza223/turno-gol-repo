import { describe, expect, it, vi } from 'vitest'
import {
  isMpUnauthorized,
  withTokenRefresh,
} from '@/modules/payments/mp-token-refresh'

describe('isMpUnauthorized', () => {
  it('detects 401 across shapes', () => {
    expect(isMpUnauthorized({ status: 401 })).toBe(true)
    expect(isMpUnauthorized({ statusCode: 401 })).toBe(true)
    expect(isMpUnauthorized({ cause: { status: 401 } })).toBe(true)
    expect(isMpUnauthorized(new Error('Request failed with status 401'))).toBe(true)
    expect(isMpUnauthorized(new Error('unauthorized'))).toBe(true)
  })

  it('is false for non-401 / non-error inputs', () => {
    expect(isMpUnauthorized({ status: 500 })).toBe(false)
    expect(isMpUnauthorized(new Error('boom'))).toBe(false)
    expect(isMpUnauthorized(null)).toBe(false)
    expect(isMpUnauthorized('401')).toBe(false)
    expect(isMpUnauthorized({ status: 4010 })).toBe(false)
  })
})

describe('withTokenRefresh', () => {
  it('returns the result without refreshing when op succeeds', async () => {
    const refresh = vi.fn(async () => {})
    const op = vi.fn(async () => 'ok')

    await expect(withTokenRefresh(op, refresh)).resolves.toBe('ok')
    expect(refresh).not.toHaveBeenCalled()
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('refreshes and retries once on a 401, then succeeds', async () => {
    const refresh = vi.fn(async () => {})
    const op = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce({ status: 401 })
      .mockResolvedValueOnce('recovered')

    await expect(withTokenRefresh(op, refresh)).resolves.toBe('recovered')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(op).toHaveBeenCalledTimes(2)
  })

  it('does not retry on a non-401 error', async () => {
    const refresh = vi.fn(async () => {})
    const op = vi.fn(async () => {
      throw new Error('500 server error')
    })

    await expect(withTokenRefresh(op, refresh)).rejects.toThrow('500 server error')
    expect(refresh).not.toHaveBeenCalled()
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('propagates a second 401 after refreshing', async () => {
    const refresh = vi.fn(async () => {})
    const op = vi.fn(async () => {
      throw { status: 401 }
    })

    await expect(withTokenRefresh(op, refresh)).rejects.toEqual({ status: 401 })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(op).toHaveBeenCalledTimes(2)
  })
})
