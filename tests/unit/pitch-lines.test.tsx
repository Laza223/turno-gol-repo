// @vitest-environment happy-dom
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import PitchLines from '@/app/(public)/explorar/components/PitchLines'

afterEach(() => cleanup())

describe('PitchLines', () => {
  it('renderiza un svg decorativo aria-hidden (no en el árbol accesible)', () => {
    const { container } = render(<PitchLines />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })

  it('acepta className y lo aplica al svg', () => {
    const { container } = render(<PitchLines className="text-emerald-600/20" />)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('text-emerald-600/20')
  })
})
