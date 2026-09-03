import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hallazgo #8 — misma clase, canteen (pedido explícito del hallazgo: "revisá
// si el mismo patrón se repite en canteen y stock"). `sellTicket` tiene DOS
// SELECT sobre `cash_flows` filtrando solo por `client_idempotency_key`
// (índice único GLOBAL, migr. 023), sin tenant_id: el pre-check (fast path,
// antes de tomar locks) y el re-check (bajo lock).

type StringChunkLike = { value: string[] }
function isStringChunk(c: unknown): c is StringChunkLike {
  return !!c && typeof c === 'object' && Array.isArray((c as StringChunkLike).value)
}
function sqlText(sqlObj: unknown): string {
  const chunks = (sqlObj as { queryChunks: unknown[] }).queryChunks
  return chunks.map((c) => (isStringChunk(c) ? c.value.join('') : '?')).join('')
}
function sqlValues(sqlObj: unknown): unknown[] {
  const chunks = (sqlObj as { queryChunks: unknown[] }).queryChunks
  return chunks.filter((c) => !isStringChunk(c))
}

import { sellTicket } from '@/modules/canteen/canteen-sale.service'
import type { DbTx } from '@/shared/db/client'
import type { SellTicketInput } from '@/modules/canteen/canteen.types'

const TENANT_A = 'tenant-a-uuid'
const PRODUCT_ROW = {
  id: 'prod-1',
  name: 'Agua',
  price: 500,
  stock: null,
  is_active: true,
}

const input: SellTicketInput = {
  lines: [{ productId: 'prod-1', qty: 1 }],
  method: 'cash',
  clientIdempotencyKey: 'idem-key-1',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sellTicket — los SELECT de dedupe sobre cash_flows filtran por tenant_id explícito', () => {
  it('(1) fast path pre-lock: el SQL liga tenant_id además de client_idempotency_key', async () => {
    let captured: unknown
    const execute = vi.fn((arg: unknown) => {
      captured = arg
      // Corta acá devolviendo un match: no hace falta simular el resto del flujo.
      return Promise.resolve([{ id: 'existing-cf', amount: 500 }])
    })
    const tx = { execute } as unknown as DbTx

    await sellTicket(TENANT_A, 'staff-1', input, tx)

    expect(captured).toBeDefined()
    expect(sqlText(captured)).toMatch(/tenant_id/)
    expect(sqlValues(captured)).toContain(TENANT_A)
  })

  it('(2) re-check bajo lock: el SQL liga tenant_id además de client_idempotency_key', async () => {
    let captured: unknown
    let call = 0
    const execute = vi.fn((arg: unknown) => {
      call += 1
      switch (call) {
        case 1: // fast path pre-lock: sin match, sigue
          return Promise.resolve([])
        case 2: // lockProducts
          return Promise.resolve([PRODUCT_ROW])
        case 3: // el re-check bajo la lupa
          captured = arg
          return Promise.resolve([{ id: 'existing-cf', amount: 500 }])
        default:
          return Promise.resolve([])
      }
    })
    const tx = { execute } as unknown as DbTx

    await sellTicket(TENANT_A, 'staff-1', input, tx)

    expect(captured).toBeDefined()
    expect(sqlText(captured)).toMatch(/tenant_id/)
    expect(sqlValues(captured)).toContain(TENANT_A)
  })
})
