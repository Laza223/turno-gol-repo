// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

describe('Primitives mobile-first touch target cascade', () => {
  it('Button default has h-11 (mobile) + md:h-10 (desktop)', () => {
    const { container } = render(<Button>Test</Button>)
    const btn = container.querySelector('button')!
    expect(btn.className).toMatch(/\bh-11\b/)
    expect(btn.className).toMatch(/\bmd:h-10\b/)
  })

  it('Button sm has h-10 (mobile) + md:h-9 (desktop)', () => {
    const { container } = render(<Button size="sm">Test</Button>)
    const btn = container.querySelector('button')!
    expect(btn.className).toMatch(/\bh-10\b/)
    expect(btn.className).toMatch(/\bmd:h-9\b/)
  })

  it('Button icon has h-11 w-11 (mobile) + md:h-10 md:w-10 (desktop)', () => {
    const { container } = render(<Button size="icon" aria-label="x">i</Button>)
    const btn = container.querySelector('button')!
    expect(btn.className).toMatch(/\bh-11\b/)
    expect(btn.className).toMatch(/\bw-11\b/)
    expect(btn.className).toMatch(/\bmd:h-10\b/)
    expect(btn.className).toMatch(/\bmd:w-10\b/)
  })

  it('Button lg stays h-11 (single declaration)', () => {
    const { container } = render(<Button size="lg">Test</Button>)
    const btn = container.querySelector('button')!
    expect(btn.className).toMatch(/\bh-11\b/)
    // lg should NOT have md:h-10 override (it stays 44px on desktop too)
    expect(btn.className).not.toMatch(/\bmd:h-10\b/)
  })

  it('Input has h-11 (mobile) + md:h-10 (desktop)', () => {
    const { container } = render(<Input placeholder="x" />)
    const input = container.querySelector('input')!
    expect(input.className).toMatch(/\bh-11\b/)
    expect(input.className).toMatch(/\bmd:h-10\b/)
  })
})
