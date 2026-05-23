import { describe, expect, it } from 'vitest'
import { sanitizeNext } from '@/lib/safe-redirect'

describe('sanitizeNext', () => {
  it('keeps a same-origin relative path', () => {
    expect(sanitizeNext('/club-x/reservar?court=1')).toBe('/club-x/reservar?court=1')
  })
  it('falls back when null', () => {
    expect(sanitizeNext(null)).toBe('/mis-reservas')
  })
  it('rejects protocol-relative //evil.com', () => {
    expect(sanitizeNext('//evil.com')).toBe('/mis-reservas')
  })
  it('rejects absolute http URLs', () => {
    expect(sanitizeNext('https://evil.com')).toBe('/mis-reservas')
  })
  it('rejects backslash trick /\\evil.com', () => {
    expect(sanitizeNext('/\\evil.com')).toBe('/mis-reservas')
  })
  it('honors a custom fallback', () => {
    expect(sanitizeNext(undefined, '/explorar')).toBe('/explorar')
  })
})
