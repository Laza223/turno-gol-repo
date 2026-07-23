import { describe, expect, it } from 'vitest'
import {
  adjustStockSchema,
  cancelTabSchema,
  createProductSchema,
  createTabSchema,
  registerPurchaseSchema,
  registerStockExitSchema,
  sellTicketSchema,
  settleTabSchema,
  updateProductSchema,
} from '@/modules/canteen/canteen.schema'

function validLine() {
  return { productId: crypto.randomUUID(), qty: 1 }
}

describe('sellTicketSchema', () => {
  const base = () => ({
    lines: [validLine()],
    method: 'cash' as const,
    clientIdempotencyKey: crypto.randomUUID(),
  })

  it('accepts a well-formed single-line ticket', () => {
    expect(sellTicketSchema.safeParse(base()).success).toBe(true)
  })

  it('rejects an empty lines array (a ticket needs at least one product)', () => {
    const result = sellTicketSchema.safeParse({ ...base(), lines: [] })
    expect(result.success).toBe(false)
  })

  it('rejects qty = 0 in a line', () => {
    const result = sellTicketSchema.safeParse({
      ...base(),
      lines: [{ productId: crypto.randomUUID(), qty: 0 }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects qty > 99 in a line', () => {
    const result = sellTicketSchema.safeParse({
      ...base(),
      lines: [{ productId: crypto.randomUUID(), qty: 100 }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts the qty = 99 boundary', () => {
    const result = sellTicketSchema.safeParse({
      ...base(),
      lines: [{ productId: crypto.randomUUID(), qty: 99 }],
    })
    expect(result.success).toBe(true)
  })

  it("rejects method 'other' (la cantina no cobra por método 'otro', a diferencia de un gasto genérico)", () => {
    const result = sellTicketSchema.safeParse({ ...base(), method: 'other' })
    expect(result.success).toBe(false)
  })

  it('rejects a non-UUID clientIdempotencyKey', () => {
    const result = sellTicketSchema.safeParse({ ...base(), clientIdempotencyKey: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects more than 20 lines', () => {
    const lines = Array.from({ length: 21 }, () => validLine())
    const result = sellTicketSchema.safeParse({ ...base(), lines })
    expect(result.success).toBe(false)
  })
})

describe('createProductSchema', () => {
  const base = () => ({ name: 'Agua', price: 150000 })

  it('accepts a minimal valid product', () => {
    expect(createProductSchema.safeParse(base()).success).toBe(true)
  })

  it('rejects an empty name', () => {
    expect(createProductSchema.safeParse({ ...base(), name: '' }).success).toBe(false)
  })

  it('rejects a whitespace-only name (trim vacío)', () => {
    expect(createProductSchema.safeParse({ ...base(), name: '   ' }).success).toBe(false)
  })

  // Gap cerrado: price usa .positive() (la 048 exige CHECK price > 0) — un 0
  // se rechaza en Zod con mensaje legible, no con un 23514 crudo del INSERT.
  it('rejects price = 0 (la DB exige price > 0)', () => {
    const result = createProductSchema.safeParse({ ...base(), price: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects a negative price', () => {
    expect(createProductSchema.safeParse({ ...base(), price: -100 }).success).toBe(false)
  })

  it('rejects negative stock', () => {
    expect(createProductSchema.safeParse({ ...base(), stock: -1 }).success).toBe(false)
  })

  it('rejects negative minStock', () => {
    expect(createProductSchema.safeParse({ ...base(), minStock: -1 }).success).toBe(false)
  })

  it('accepts null stock/minStock (sin control de stock / sin alerta)', () => {
    expect(createProductSchema.safeParse({ ...base(), stock: null, minStock: null }).success).toBe(true)
  })
})

describe('updateProductSchema', () => {
  it('accepts a partial patch with an isActive toggle', () => {
    const result = updateProductSchema.safeParse({
      productId: crypto.randomUUID(),
      patch: { isActive: false },
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-uuid productId', () => {
    const result = updateProductSchema.safeParse({ productId: 'nope', patch: {} })
    expect(result.success).toBe(false)
  })
})

describe('registerStockExitSchema', () => {
  const base = () => ({
    productId: crypto.randomUUID(),
    units: 1,
    reason: 'waste' as const,
    note: 'se rompió una botella en el depósito',
    clientIdempotencyKey: crypto.randomUUID(),
  })

  it('accepts a well-formed exit', () => {
    expect(registerStockExitSchema.safeParse(base()).success).toBe(true)
  })

  it('rejects an empty note (motivo obligatorio: es lo que hace auditable la salida)', () => {
    expect(registerStockExitSchema.safeParse({ ...base(), note: '' }).success).toBe(false)
  })

  it('rejects units <= 0', () => {
    expect(registerStockExitSchema.safeParse({ ...base(), units: 0 }).success).toBe(false)
  })

  it("rejects a reason outside the enum ('theft' no es una razón soportada)", () => {
    expect(registerStockExitSchema.safeParse({ ...base(), reason: 'theft' }).success).toBe(false)
  })
})

describe('adjustStockSchema', () => {
  const base = () => ({
    productId: crypto.randomUUID(),
    newStock: 5,
    note: 'conteo físico de fin de mes',
    clientIdempotencyKey: crypto.randomUUID(),
  })

  it('accepts a well-formed adjustment', () => {
    expect(adjustStockSchema.safeParse(base()).success).toBe(true)
  })

  it('rejects a negative newStock (el conteo real nunca es negativo)', () => {
    expect(adjustStockSchema.safeParse({ ...base(), newStock: -1 }).success).toBe(false)
  })

  it('rejects an empty note (motivo obligatorio del ajuste)', () => {
    expect(adjustStockSchema.safeParse({ ...base(), note: '' }).success).toBe(false)
  })

  it('accepts newStock = 0 (se vendió/rompió todo)', () => {
    expect(adjustStockSchema.safeParse({ ...base(), newStock: 0 }).success).toBe(true)
  })
})

describe('registerPurchaseSchema', () => {
  it('accepts a purchase with packs × unidades por pack ya multiplicado', () => {
    const result = registerPurchaseSchema.safeParse({
      productId: crypto.randomUUID(),
      units: 24,
      unitCost: 100000,
      updateProductCost: true,
      clientIdempotencyKey: crypto.randomUUID(),
    })
    expect(result.success).toBe(true)
  })

  it('rejects units <= 0', () => {
    const result = registerPurchaseSchema.safeParse({
      productId: crypto.randomUUID(),
      units: 0,
      clientIdempotencyKey: crypto.randomUUID(),
    })
    expect(result.success).toBe(false)
  })
})

describe('createTabSchema', () => {
  const base = () => ({
    debtorName: 'Juan Pérez',
    lines: [validLine()],
    clientIdempotencyKey: crypto.randomUUID(),
  })

  it('accepts a well-formed tab', () => {
    expect(createTabSchema.safeParse(base()).success).toBe(true)
  })

  it('rejects an empty debtorName', () => {
    expect(createTabSchema.safeParse({ ...base(), debtorName: '' }).success).toBe(false)
  })

  it('rejects a whitespace-only debtorName', () => {
    expect(createTabSchema.safeParse({ ...base(), debtorName: '   ' }).success).toBe(false)
  })

  it('rejects an empty lines array', () => {
    expect(createTabSchema.safeParse({ ...base(), lines: [] }).success).toBe(false)
  })
})

describe('settleTabSchema / cancelTabSchema', () => {
  it('settleTabSchema rejects method "other"', () => {
    const result = settleTabSchema.safeParse({
      tabId: crypto.randomUUID(),
      method: 'other',
      clientIdempotencyKey: crypto.randomUUID(),
    })
    expect(result.success).toBe(false)
  })

  it('cancelTabSchema requires a non-empty reason', () => {
    const result = cancelTabSchema.safeParse({ tabId: crypto.randomUUID(), reason: '' })
    expect(result.success).toBe(false)
  })
})
