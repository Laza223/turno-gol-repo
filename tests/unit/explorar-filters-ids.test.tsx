// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))

import ExplorarFilters from '@/app/(public)/explorar/components/ExplorarFilters'

afterEach(() => cleanup())

// En /explorar el panel se monta dos veces a la vez: en el sidebar (`hidden lg:block`,
// siempre en el DOM) y en el drawer "Todos los filtros" (QuickFilters, Radix Sheet).
function mountBoth() {
  render(
    <>
      <div data-testid="sidebar">
        <ExplorarFilters idPrefix="sidebar-" />
      </div>
      <div data-testid="drawer">
        <ExplorarFilters />
      </div>
    </>,
  )
  return { sidebar: screen.getByTestId('sidebar'), drawer: screen.getByTestId('drawer') }
}

describe('ExplorarFilters montado dos veces (sidebar + drawer)', () => {
  it('no repite ningún id en el documento', () => {
    mountBoth()
    const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id)
    const repeated = ids.filter((id, i) => ids.indexOf(id) !== i)
    expect(repeated).toEqual([])
  })

  it('cada label htmlFor apunta a un input de SU instancia', () => {
    const roots = mountBoth()
    for (const root of Object.values(roots)) {
      const labels = Array.from(root.querySelectorAll('label[for]'))
      expect(labels.length).toBeGreaterThan(0)
      for (const label of labels) {
        const target = document.getElementById(label.getAttribute('for') ?? '')
        expect(target, `label "${label.textContent}"`).not.toBeNull()
        expect(root.contains(target)).toBe(true)
      }
    }
  })

  it('el drawer conserva #min-price y #max-price (los fija TG-HP-002)', () => {
    const { drawer, sidebar } = mountBoth()
    expect(drawer.querySelector('#min-price')).not.toBeNull()
    expect(drawer.querySelector('#max-price')).not.toBeNull()
    expect(sidebar.querySelector('#min-price')).toBeNull()
    expect(sidebar.querySelector('#max-price')).toBeNull()
  })
})
