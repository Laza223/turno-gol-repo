// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@/app/(public)/explorar/components/SearchBar', () => ({
  default: () => <div data-testid="searchbar" />,
}))

import SearchBand from '@/app/(public)/explorar/components/SearchBand'

afterEach(() => cleanup())

describe('SearchBand', () => {
  it('renderiza el titular en font-display y contiene el SearchBar', () => {
    render(<SearchBand cities={[]} />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.className).toContain('font-display')
    expect(screen.getByTestId('searchbar')).toBeTruthy()
  })
})
