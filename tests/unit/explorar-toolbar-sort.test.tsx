// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

let current = new URLSearchParams('')
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => current,
}))

import ExplorarToolbar from '@/app/(public)/explorar/components/ExplorarToolbar'
import { effectiveSort } from '@/modules/tenants/search.service'

afterEach(() => cleanup())

function sortSelect(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: /ordenar por/i }) as HTMLSelectElement
}

// searchPublicTenants ordena por nombre cuando llega sort=distance sin coordenadas
// (case 'distance': hasGeo ? distancia : nombre). La UI tiene que mostrar ese orden.
describe('effectiveSort', () => {
  it('distance sin coordenadas cae a nombre', () => {
    expect(effectiveSort('distance', undefined, undefined)).toBe('name')
  })

  it('distance con solo una coordenada también cae a nombre (hasGeo pide las dos)', () => {
    expect(effectiveSort('distance', -34.6, undefined)).toBe('name')
    expect(effectiveSort('distance', undefined, -58.4)).toBe('name')
  })

  it('distance con lat y lng se respeta', () => {
    expect(effectiveSort('distance', -34.6, -58.4)).toBe('distance')
  })

  it('los demás órdenes no dependen de las coordenadas', () => {
    expect(effectiveSort('price', undefined, undefined)).toBe('price')
    expect(effectiveSort('rating', undefined, undefined)).toBe('rating')
    expect(effectiveSort('name', undefined, undefined)).toBe('name')
  })

  it('sin sort es nombre', () => {
    expect(effectiveSort(undefined, undefined, undefined)).toBe('name')
  })
})

describe('ExplorarToolbar: el select muestra el orden aplicado', () => {
  it('?sort=distance sin ubicación: la página pasa name y el select NO dice "Más cercano"', () => {
    current = new URLSearchParams('sort=distance')
    render(<ExplorarToolbar total={3} sort={effectiveSort('distance', undefined, undefined)} />)
    expect(sortSelect().value).toBe('name')
  })

  it('?sort=distance con ubicación: el select dice "Más cercano"', () => {
    current = new URLSearchParams('sort=distance&lat=-34.6&lng=-58.4')
    render(<ExplorarToolbar total={3} sort={effectiveSort('distance', -34.6, -58.4)} />)
    expect(sortSelect().value).toBe('distance')
  })

  it('refleja otro orden aplicado', () => {
    current = new URLSearchParams('sort=price')
    render(<ExplorarToolbar total={3} sort="price" />)
    expect(sortSelect().value).toBe('price')
  })
})
