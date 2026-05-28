import { describe, expect, it } from 'vitest'
import { formatRemaining } from '@/components/booking/format-remaining'

describe('formatRemaining', () => {
  it('formats 65000ms as 1:05', () => {
    expect(formatRemaining(65000)).toBe('1:05')
  })

  it('formats 0ms as 0:00', () => {
    expect(formatRemaining(0)).toBe('0:00')
  })

  it('formats negative ms as 0:00', () => {
    expect(formatRemaining(-5000)).toBe('0:00')
  })

  it('formats 600000ms as 10:00', () => {
    expect(formatRemaining(600000)).toBe('10:00')
  })

  it('formats 5000ms as 0:05', () => {
    expect(formatRemaining(5000)).toBe('0:05')
  })
})
