import { describe, expect, it } from 'vitest'
import { isDroppableDomainError } from '@/lib/sentry-event-filter'
import { InvalidTransitionError } from '@/modules/billing/billing.errors'

describe('isDroppableDomainError', () => {
  it('returns true for InvalidTransitionError', () => {
    const hint = { originalException: new InvalidTransitionError('t1', 'active', 'deleted') }
    expect(isDroppableDomainError(hint)).toBe(true)
  })

  it('returns false for a generic Error', () => {
    const hint = { originalException: new Error('boom') }
    expect(isDroppableDomainError(hint)).toBe(false)
  })

  it('returns false when hint is undefined', () => {
    expect(isDroppableDomainError(undefined)).toBe(false)
  })

  it('returns false when originalException is a plain string', () => {
    const hint = { originalException: 'a string' }
    expect(isDroppableDomainError(hint)).toBe(false)
  })
})
