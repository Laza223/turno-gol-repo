import { describe, expect, it } from 'vitest'
import { pageItems } from '@/components/ui/pager'

describe('pageItems', () => {
  it('con 7 páginas o menos las muestra todas, sin huecos', () => {
    expect(pageItems(0, 1)).toEqual([0])
    expect(pageItems(3, 7)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('cerca del principio: las primeras cinco, hueco y la última', () => {
    expect(pageItems(0, 13)).toEqual([0, 1, 2, 3, 4, 'gap', 12])
    expect(pageItems(3, 13)).toEqual([0, 1, 2, 3, 4, 'gap', 12])
  })

  it('en el medio: primera, la actual con una a cada lado y la última', () => {
    expect(pageItems(4, 13)).toEqual([0, 'gap', 3, 4, 5, 'gap', 12])
    expect(pageItems(8, 13)).toEqual([0, 'gap', 7, 8, 9, 'gap', 12])
  })

  it('cerca del final: la primera, hueco y las últimas cinco', () => {
    expect(pageItems(9, 13)).toEqual([0, 'gap', 8, 9, 10, 11, 12])
    expect(pageItems(12, 13)).toEqual([0, 'gap', 8, 9, 10, 11, 12])
  })

  it('siempre son 7 lugares y la actual siempre está', () => {
    for (let count = 8; count <= 40; count++) {
      for (let current = 0; current < count; current++) {
        const items = pageItems(current, count)
        expect(items).toHaveLength(7)
        expect(items).toContain(current)
        expect(items[0]).toBe(0)
        expect(items[6]).toBe(count - 1)
      }
    }
  })
})
