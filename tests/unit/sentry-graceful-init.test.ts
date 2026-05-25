import { describe, expect, it } from 'vitest'
import { isValidDsn } from '@/lib/sentry-event-filter'

describe('isValidDsn', () => {
  it('returns false for undefined', () => {
    expect(isValidDsn(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isValidDsn('')).toBe(false)
  })

  it('returns false for a non-URL string', () => {
    expect(isValidDsn('not-a-url')).toBe(false)
  })

  it('returns false for a valid URL without a public key (username)', () => {
    expect(isValidDsn('https://sentry.io/123')).toBe(false)
  })

  it('returns true for a well-formed Sentry DSN with https and a username', () => {
    expect(isValidDsn('https://abc123@o0.ingest.sentry.io/456')).toBe(true)
  })

  it('returns true for an http DSN with a key (localhost dev)', () => {
    expect(isValidDsn('http://key@localhost/1')).toBe(true)
  })
})
