import { afterEach, describe, expect, it, vi } from 'vitest'
import { scheduleBookingExpiry, setExpiryScheduler } from '@/shared/jobs/schedule-expiry'
import { DEFAULT_EXPIRY_SECONDS } from '@/shared/jobs/definitions'

afterEach(() => setExpiryScheduler(null))

describe('scheduleBookingExpiry', () => {
  it('routes to the override with the default 15-min delay', async () => {
    const spy = vi.fn(async () => {})
    setExpiryScheduler(spy)

    await scheduleBookingExpiry('booking-1')

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('booking-1', DEFAULT_EXPIRY_SECONDS)
  })

  it('rounds and floors the delay to a non-negative integer', async () => {
    const spy = vi.fn(async () => {})
    setExpiryScheduler(spy)

    await scheduleBookingExpiry('booking-2', -10)
    await scheduleBookingExpiry('booking-3', 12.6)

    expect(spy).toHaveBeenNthCalledWith(1, 'booking-2', 0)
    expect(spy).toHaveBeenNthCalledWith(2, 'booking-3', 13)
  })
})
