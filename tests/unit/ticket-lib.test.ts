import { describe, expect, it } from 'vitest'
import {
  addProduct,
  decrementLine,
  incrementLine,
  removeLine,
  ticketCount,
  ticketTotal,
  type TicketLine,
  type TicketProduct,
} from '@/app/(admin)/caja/cantina/ticket-lib'

const AGUA: TicketProduct = { id: 'p-agua', name: 'Agua', price: 150000, stock: null }
const GATORADE: TicketProduct = { id: 'p-gatorade', name: 'Gatorade', price: 250000, stock: 3 }

function lineOf(lines: TicketLine[], productId: string): TicketLine | undefined {
  return lines.find((l) => l.productId === productId)
}

describe('addProduct', () => {
  it('agrega una línea nueva en cantidad 1', () => {
    const result = addProduct([], AGUA)
    expect(result).toEqual([
      { productId: 'p-agua', name: 'Agua', price: 150000, qty: 1, stock: null },
    ])
  })

  it('si el producto ya está, suma 1 a la línea existente', () => {
    const first = addProduct([], AGUA)
    const second = addProduct(first, AGUA)
    expect(lineOf(second, 'p-agua')?.qty).toBe(2)
  })

  it('respeta el tope de stock del producto', () => {
    let lines = addProduct([], GATORADE) // qty 1
    lines = addProduct(lines, GATORADE) // qty 2
    lines = addProduct(lines, GATORADE) // qty 3 (== stock)
    expect(lineOf(lines, 'p-gatorade')?.qty).toBe(3)
  })

  it('al llegar al tope de stock, agregar de nuevo es no-op', () => {
    let lines = addProduct([], GATORADE)
    lines = addProduct(lines, GATORADE)
    lines = addProduct(lines, GATORADE) // qty 3, tope
    const beforeTope = lines
    lines = addProduct(lines, GATORADE)
    expect(lines).toBe(beforeTope) // misma referencia: no-op real
    expect(lineOf(lines, 'p-gatorade')?.qty).toBe(3)
  })

  it('sin control de stock, el tope duro es 99', () => {
    let lines: TicketLine[] = []
    for (let i = 0; i < 99; i++) lines = addProduct(lines, AGUA)
    expect(lineOf(lines, 'p-agua')?.qty).toBe(99)
    lines = addProduct(lines, AGUA) // intento 100: no-op
    expect(lineOf(lines, 'p-agua')?.qty).toBe(99)
  })

  it('no muta el array original', () => {
    const original: TicketLine[] = []
    const result = addProduct(original, AGUA)
    expect(original).toEqual([])
    expect(result).not.toBe(original)
  })
})

describe('incrementLine', () => {
  it('suma 1 a la línea indicada', () => {
    const lines = addProduct([], AGUA)
    const result = incrementLine(lines, 'p-agua')
    expect(lineOf(result, 'p-agua')?.qty).toBe(2)
  })

  it('respeta el mismo tope que addProduct', () => {
    let lines = addProduct([], GATORADE)
    lines = incrementLine(lines, 'p-gatorade') // 2
    lines = incrementLine(lines, 'p-gatorade') // 3, tope
    lines = incrementLine(lines, 'p-gatorade') // no-op
    expect(lineOf(lines, 'p-gatorade')?.qty).toBe(3)
  })

  it('no toca otras líneas', () => {
    let lines = addProduct([], AGUA)
    lines = addProduct(lines, GATORADE)
    lines = incrementLine(lines, 'p-agua')
    expect(lineOf(lines, 'p-gatorade')?.qty).toBe(1)
  })
})

describe('decrementLine', () => {
  it('resta 1 a la línea indicada', () => {
    let lines = addProduct([], AGUA)
    lines = incrementLine(lines, 'p-agua') // qty 2
    lines = decrementLine(lines, 'p-agua')
    expect(lineOf(lines, 'p-agua')?.qty).toBe(1)
  })

  it('tiene piso 1: no baja de 1 ni la remueve', () => {
    const lines = addProduct([], AGUA) // qty 1
    const result = decrementLine(lines, 'p-agua')
    expect(lineOf(result, 'p-agua')?.qty).toBe(1)
    expect(result).toHaveLength(1)
  })
})

describe('removeLine', () => {
  it('quita la línea entera del ticket', () => {
    let lines = addProduct([], AGUA)
    lines = addProduct(lines, GATORADE)
    const result = removeLine(lines, 'p-agua')
    expect(result).toHaveLength(1)
    expect(lineOf(result, 'p-agua')).toBeUndefined()
    expect(lineOf(result, 'p-gatorade')).toBeDefined()
  })

  it('no-op si el productId no está en el ticket', () => {
    const lines = addProduct([], AGUA)
    const result = removeLine(lines, 'p-inexistente')
    expect(result).toHaveLength(1)
  })
})

describe('ticketTotal / ticketCount', () => {
  it('total suma price*qty de todas las líneas, en centavos', () => {
    let lines = addProduct([], AGUA) // 150000 x1
    lines = addProduct(lines, GATORADE) // 250000 x1
    lines = incrementLine(lines, 'p-gatorade') // 250000 x2
    expect(ticketTotal(lines)).toBe(150000 + 250000 * 2)
  })

  it('total de un ticket vacío es 0', () => {
    expect(ticketTotal([])).toBe(0)
  })

  it('count suma las unidades (qty) de todas las líneas, no la cantidad de líneas', () => {
    let lines = addProduct([], AGUA)
    lines = incrementLine(lines, 'p-agua') // 2
    lines = addProduct(lines, GATORADE) // 1
    expect(ticketCount(lines)).toBe(3)
  })

  it('count de un ticket vacío es 0', () => {
    expect(ticketCount([])).toBe(0)
  })
})
