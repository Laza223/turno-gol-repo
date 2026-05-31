import { describe, expect, it } from 'vitest'
import { buildWhatsappUrl } from '@/lib/whatsapp'

describe('buildWhatsappUrl', () => {
  it('returns null for null/undefined/empty', () => {
    expect(buildWhatsappUrl(null)).toBeNull()
    expect(buildWhatsappUrl(undefined)).toBeNull()
    expect(buildWhatsappUrl('')).toBeNull()
  })

  it('returns null when there are no digits', () => {
    expect(buildWhatsappUrl('   ')).toBeNull()
    expect(buildWhatsappUrl('no-number')).toBeNull()
  })

  it('strips formatting to digits and builds a wa.me link', () => {
    expect(buildWhatsappUrl('+54 9 11 1234-5678')).toBe('https://wa.me/5491112345678')
    expect(buildWhatsappUrl('(011) 1234-5678')).toBe('https://wa.me/01112345678')
  })

  it('appends a URL-encoded prefilled message when provided', () => {
    expect(buildWhatsappUrl('5491112345678', 'Hola, quiero reservar')).toBe(
      'https://wa.me/5491112345678?text=Hola%2C%20quiero%20reservar',
    )
  })

  it('omits the text param when message is empty', () => {
    expect(buildWhatsappUrl('5491112345678', '')).toBe('https://wa.me/5491112345678')
  })
})
