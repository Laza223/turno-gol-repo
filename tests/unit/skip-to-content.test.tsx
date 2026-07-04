// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

afterEach(cleanup)

describe('Skip-to-content link', () => {
  it('renders with href="#main-content" and is sr-only by default', () => {
    render(
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      >
        Saltar al contenido
      </a>,
    )
    const link = screen.getByRole('link', { name: /saltar al contenido/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('#main-content')
    expect(link.className).toMatch(/sr-only/)
    expect(link.className).toMatch(/focus:not-sr-only/)
  })

  it('root layout.tsx includes the skip link', () => {
    const src = readFileSync(resolve(__dirname, '../../src/app/layout.tsx'), 'utf8')
    expect(src).toContain('href="#main-content"')
    expect(src).toContain('Saltar al contenido')
    expect(src).toMatch(/sr-only focus:not-sr-only/)
  })
})
