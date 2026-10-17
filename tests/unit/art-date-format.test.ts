import { describe, expect, it } from 'vitest'
import { formatArtDate } from '@/shared/time/art-date'

describe('formatArtDate', () => {
  it('00:00 ART (03:00Z) ya es el día calendario nuevo', () => {
    expect(formatArtDate(new Date('2026-10-18T03:00:00Z'))).toBe('18/10/2026')
  })

  it('control negativo: 23:59 ART (02:59Z) sigue siendo el día anterior', () => {
    expect(formatArtDate(new Date('2026-10-18T02:59:00Z'))).toBe('17/10/2026')
  })
})
