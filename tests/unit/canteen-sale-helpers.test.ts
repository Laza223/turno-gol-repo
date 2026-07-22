import { describe, expect, it } from 'vitest'
import { normalizeTicketLines, ticketDescription } from '@/modules/canteen/canteen-sale.service'

describe('normalizeTicketLines', () => {
  it('merges repeated lines of the same product and sums their qty', () => {
    const idA = crypto.randomUUID()
    const idB = crypto.randomUUID()
    const result = normalizeTicketLines([
      { productId: idA, qty: 2 },
      { productId: idB, qty: 1 },
      { productId: idA, qty: 3 },
    ])

    const byId = new Map(result.map((l) => [l.productId, l.qty]))
    expect(result).toHaveLength(2)
    expect(byId.get(idA)).toBe(5)
    expect(byId.get(idB)).toBe(1)
  })

  it('returns an empty array for an empty ticket', () => {
    expect(normalizeTicketLines([])).toEqual([])
  })

  it('does not corrupt a ticket with no repeated products', () => {
    const idA = crypto.randomUUID()
    const idB = crypto.randomUUID()
    const result = normalizeTicketLines([
      { productId: idA, qty: 1 },
      { productId: idB, qty: 4 },
    ])
    const byId = new Map(result.map((l) => [l.productId, l.qty]))
    expect(result).toHaveLength(2)
    expect(byId.get(idA)).toBe(1)
    expect(byId.get(idB)).toBe(4)
  })
})

describe('ticketDescription', () => {
  it('formats a multi-line ticket: qty > 1 gets "x{qty}", qty = 1 has no suffix', () => {
    const description = ticketDescription([
      { name: 'Agua', qty: 2 },
      { name: 'Cerveza', qty: 1 },
    ])
    expect(description).toBe('Cantina: Agua x2, Cerveza')
  })

  it('formats a single qty=1 line with no "x1" suffix', () => {
    expect(ticketDescription([{ name: 'Agua', qty: 1 }])).toBe('Cantina: Agua')
  })

  it('truncates to at most 500 chars for a giant product name, ending with an ellipsis', () => {
    const giantName = 'A'.repeat(600)
    const description = ticketDescription([{ name: giantName, qty: 1 }])
    expect(description.length).toBe(500)
    expect(description.startsWith('Cantina: ')).toBe(true)
    expect(description.endsWith('…')).toBe(true)
  })

  it('does not truncate a description that lands exactly at the 500-char boundary', () => {
    // 'Cantina: ' son 9 chars; nombre de 491 chars -> full.length === 500 exacto,
    // que cae del lado "<= 500" (sin truncar). Ejercita el boundary real de la
    // condición, no solo un caso claramente corto o claramente largo.
    const name = 'B'.repeat(491)
    const description = ticketDescription([{ name, qty: 1 }])
    expect(description.length).toBe(500)
    expect(description.endsWith('…')).toBe(false)
  })
})
