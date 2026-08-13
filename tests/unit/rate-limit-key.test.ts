import { describe, expect, it } from 'vitest'
import { parseClientIp } from '@/shared/rate-limit/key'

describe('parseClientIp', () => {
  it('returns "unknown" when no header', () => {
    expect(parseClientIp(new Headers())).toBe('unknown')
  })
  it('returns leftmost of x-forwarded-for (single)', () => {
    const h = new Headers({ 'x-forwarded-for': '1.2.3.4' })
    expect(parseClientIp(h)).toBe('1.2.3.4')
  })
  it('returns leftmost of x-forwarded-for (multi-hop)', () => {
    const h = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12' })
    expect(parseClientIp(h)).toBe('1.2.3.4')
  })
  it('falls back to x-real-ip when no x-forwarded-for', () => {
    const h = new Headers({ 'x-real-ip': '7.7.7.7' })
    expect(parseClientIp(h)).toBe('7.7.7.7')
  })
  it('handles surrounding whitespace', () => {
    const h = new Headers({ 'x-forwarded-for': '   1.2.3.4   , 5.6.7.8' })
    expect(parseClientIp(h)).toBe('1.2.3.4')
  })
  it('returns "unknown" when header is empty string', () => {
    const h = new Headers({ 'x-forwarded-for': '' })
    expect(parseClientIp(h)).toBe('unknown')
  })
  it('does NOT pick a non-leftmost value (spoofing guard)', () => {
    const h = new Headers({ 'x-forwarded-for': 'attacker-spoof, 5.6.7.8' })
    expect(parseClientIp(h)).toBe('attacker-spoof')
  })
  it('prefers x-vercel-forwarded-for over a spoofed x-forwarded-for (F12)', () => {
    const h = new Headers({
      'x-forwarded-for': 'attacker-spoof',
      'x-vercel-forwarded-for': '1.2.3.4',
    })
    expect(parseClientIp(h)).toBe('1.2.3.4')
  })
  it('takes the leftmost hop of x-vercel-forwarded-for', () => {
    const h = new Headers({ 'x-vercel-forwarded-for': '1.2.3.4, 5.6.7.8' })
    expect(parseClientIp(h)).toBe('1.2.3.4')
  })
  it('falls back to x-forwarded-for when x-vercel-forwarded-for is empty', () => {
    const h = new Headers({
      'x-vercel-forwarded-for': '',
      'x-forwarded-for': '9.9.9.9',
    })
    expect(parseClientIp(h)).toBe('9.9.9.9')
  })
})
