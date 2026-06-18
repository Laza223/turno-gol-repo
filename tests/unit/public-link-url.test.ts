import { describe, expect, it } from 'vitest'
import { buildPublicLinkUrl } from '@/lib/utils'

describe('buildPublicLinkUrl', () => {
  it('uses an absolute appUrl when provided', () => {
    expect(buildPublicLinkUrl('https://turnogol.app', 'https://admin.local', 'rincon')).toBe(
      'https://turnogol.app/c/rincon',
    )
  })

  it('normalizes a trailing slash on appUrl', () => {
    expect(buildPublicLinkUrl('https://turnogol.app/', null, 'rincon')).toBe(
      'https://turnogol.app/c/rincon',
    )
  })

  it('falls back to the browser origin when appUrl is empty', () => {
    expect(buildPublicLinkUrl('', 'https://app.turnogol.app', 'rincon')).toBe(
      'https://app.turnogol.app/c/rincon',
    )
  })

  it('falls back to the browser origin when appUrl is relative (not absolute)', () => {
    expect(buildPublicLinkUrl('/c', 'https://app.turnogol.app', 'rincon')).toBe(
      'https://app.turnogol.app/c/rincon',
    )
  })

  it('returns null when no absolute base is resolvable (empty appUrl + no origin)', () => {
    expect(buildPublicLinkUrl('', null, 'rincon')).toBeNull()
    expect(buildPublicLinkUrl('', '', 'rincon')).toBeNull()
  })

  it('returns null when appUrl is relative and origin is unavailable', () => {
    expect(buildPublicLinkUrl('/c', undefined, 'rincon')).toBeNull()
  })
})
