import { describe, expect, it } from 'vitest'
import { formatsLabel } from '@/app/(public)/[slug]/components/formats-label'

describe('formatsLabel', () => {
  it('formatos ordenados y sin repetir', () => {
    expect(formatsLabel([7, 5, 5])).toBe('Fútbol 5 y 7')
    expect(formatsLabel([11, 5, 7])).toBe('Fútbol 5, 7 y 11')
    expect(formatsLabel([5])).toBe('Fútbol 5')
    expect(formatsLabel([])).toBeNull()
  })
})
