import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearFeatureFlagCache, resolveFeatureFlag } from '@/shared/feature-flags'
import { logger } from '@/shared/lib/logger'

beforeEach(() => {
  clearFeatureFlagCache()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('resolveFeatureFlag', () => {
  it('returns the loaded value and passes (flag, tenant) to the loader', async () => {
    const loader = vi.fn(async (_f: string, _t: string | null): Promise<boolean | undefined> => true)
    expect(await resolveFeatureFlag('online_booking', null, loader)).toBe(true)
    expect(loader).toHaveBeenCalledWith('online_booking', null)
  })

  it('defaults unknown flags to false', async () => {
    const loader = vi.fn(
      async (_f: string, _t: string | null): Promise<boolean | undefined> => undefined,
    )
    expect(await resolveFeatureFlag('does_not_exist', null, loader)).toBe(false)
  })

  it('memoizes within the TTL — the loader runs only once', async () => {
    const loader = vi.fn(async (_f: string, _t: string | null): Promise<boolean | undefined> => true)
    await resolveFeatureFlag('f', null, loader)
    await resolveFeatureFlag('f', null, loader)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('keys the cache by (flag, tenant): global and per-tenant resolve independently', async () => {
    const loader = vi.fn(
      async (_f: string, tenantId: string | null): Promise<boolean | undefined> =>
        tenantId === 't1',
    )
    expect(await resolveFeatureFlag('suspended', null, loader)).toBe(false)
    expect(await resolveFeatureFlag('suspended', 't1', loader)).toBe(true)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('reloads after the 60s TTL expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const loader = vi
      .fn(async (_f: string, _t: string | null): Promise<boolean | undefined> => true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    expect(await resolveFeatureFlag('f', null, loader)).toBe(true)
    vi.setSystemTime(60_001)
    expect(await resolveFeatureFlag('f', null, loader)).toBe(false)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('does not reload before the TTL boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const loader = vi.fn(async (_f: string, _t: string | null): Promise<boolean | undefined> => true)
    await resolveFeatureFlag('f', null, loader)
    vi.setSystemTime(59_000)
    await resolveFeatureFlag('f', null, loader)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('clearFeatureFlagCache forces the next call to reload', async () => {
    const loader = vi.fn(async (_f: string, _t: string | null): Promise<boolean | undefined> => true)
    await resolveFeatureFlag('f', null, loader)
    clearFeatureFlagCache()
    await resolveFeatureFlag('f', null, loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('on loader error falls back to the last known value (no flip on a transient DB blip)', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const loader = vi
      .fn(async (_f: string, _t: string | null): Promise<boolean | undefined> => true)
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('db down'))
    expect(await resolveFeatureFlag('mp_payments', null, loader)).toBe(true)
    vi.setSystemTime(60_001) // expire the cache so the (now failing) loader is consulted
    expect(await resolveFeatureFlag('mp_payments', null, loader)).toBe(true)
  })

  it('on loader error with nothing cached defaults to false and logs a warning', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const loader = vi.fn(
      async (_f: string, _t: string | null): Promise<boolean | undefined> => {
        throw new Error('db down')
      },
    )
    expect(await resolveFeatureFlag('whatever', 'tenant-x', loader)).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toBe('feature_flags.load_failed')
  })
})
