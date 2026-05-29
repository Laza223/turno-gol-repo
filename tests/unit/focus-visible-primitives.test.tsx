// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'

describe('focus-visible rings on primitives', () => {
  it('Button uses focus-visible:ring-emerald-500 (not focus:)', () => {
    render(<Button>Click</Button>)
    const btn = screen.getByRole('button', { name: /click/i })
    expect(btn.className).toContain('focus-visible:ring-2')
    expect(btn.className).toContain('focus-visible:ring-emerald-500')
    expect(btn.className).not.toMatch(/(?<!visible:)focus:ring-/)
  })

  it('Input uses focus-visible:ring-emerald-500', () => {
    render(<Input data-testid="i" />)
    const input = screen.getByTestId('i')
    expect(input.className).toContain('focus-visible:ring-emerald-500')
  })

  it('Dialog close button uses focus-visible:ring (regression guard)', () => {
    render(
      <Dialog open>
        <DialogContent>
          <div>Content</div>
        </DialogContent>
      </Dialog>,
    )
    const close = screen.getByRole('button', { name: /close/i })
    expect(close.className).toContain('focus-visible:ring-2')
    expect(close.className).toContain('focus-visible:ring-emerald-500')
  })
})
