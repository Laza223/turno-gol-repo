import { describe, expect, it } from 'vitest'
import { icsEscapeText } from '@/components/booking/ics-escape'

// Security scan F21: tenantName/courtName/address/city are free text with no
// character restriction, interpolated straight into ICS lines. A CR/LF
// sequence could close the current property and inject additional
// iCalendar properties into the generated .ics file.
describe('icsEscapeText (F21)', () => {
  it('strips embedded CRLF so it cannot inject a new ICS property line', () => {
    const malicious = 'Cancha Central\r\nX-EVIL-PROPERTY:hijacked'
    const escaped = icsEscapeText(malicious)
    expect(escaped).not.toMatch(/\r|\n/)
    expect(escaped).not.toContain('X-EVIL-PROPERTY:hijacked\r\n')
  })
  it('strips a bare LF the same way', () => {
    expect(icsEscapeText('a\nb')).toBe('a b')
  })
  it('escapes backslash, semicolon, and comma per RFC 5545', () => {
    expect(icsEscapeText('a\\b;c,d')).toBe('a\\\\b\\;c\\,d')
  })
  it('leaves ordinary text untouched', () => {
    expect(icsEscapeText('Complejo Deportivo Norte')).toBe('Complejo Deportivo Norte')
  })
})
