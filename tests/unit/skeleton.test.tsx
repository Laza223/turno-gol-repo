// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Skeleton } from '@/components/ui/skeleton'

describe('Skeleton', () => {
  it('has role="status" + aria-label="Cargando…" by default', () => {
    render(<Skeleton data-testid="s" />)
    const el = screen.getByTestId('s')
    expect(el.getAttribute('role')).toBe('status')
    expect(el.getAttribute('aria-label')).toBe('Cargando…')
    expect(el.getAttribute('aria-busy')).toBe('true')
  })

  it('accepts custom label prop', () => {
    render(<Skeleton label="Cargando reservas…" data-testid="s" />)
    const el = screen.getByTestId('s')
    expect(el.getAttribute('aria-label')).toBe('Cargando reservas…')
  })

  it('suppresses role/label when aria-hidden="true"', () => {
    render(<Skeleton aria-hidden="true" data-testid="s" />)
    const el = screen.getByTestId('s')
    expect(el.getAttribute('role')).toBeNull()
    expect(el.getAttribute('aria-label')).toBeNull()
    expect(el.getAttribute('aria-busy')).toBeNull()
    expect(el.getAttribute('aria-hidden')).toBe('true')
  })

  it('applies .skeleton class for shimmer', () => {
    render(<Skeleton data-testid="s" />)
    const el = screen.getByTestId('s')
    expect(el.className).toContain('skeleton')
  })

  it('css contains prefers-reduced-motion rule for .skeleton', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const css = readFileSync(resolve(__dirname, '../../src/app/globals.css'), 'utf8')
    // Must contain both pieces in proximity
    expect(css).toMatch(/prefers-reduced-motion: reduce/)
    expect(css).toMatch(/\.skeleton\s*\{\s*animation:\s*none/)
  })
})
