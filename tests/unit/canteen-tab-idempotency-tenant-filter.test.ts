import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hallazgo #8 — misma clase, canteen (pedido explícito del hallazgo: "revisá
// si el mismo patrón se repite en canteen y stock"). `createTab` tiene TRES
// SELECT de fallback sobre `canteen_tabs` filtrando solo por
// `client_idempotency_key` (índice único GLOBAL, migr. 048), sin tenant_id.

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

import { createTab } from '@/modules/canteen/canteen-tab.service'
import type { DbTx } from '@/shared/db/client'
import type { CreateTabInput } from '@/modules/canteen/canteen-tab.service'

const TENANT_A = 'tenant-a-uuid'
const PRODUCT_ROW = { id: 'prod-1', name: 'Agua', price: 500, stock: null, is_active: true }

/**
 * Orden de llamadas de `createTab` cuando el INSERT choca (línea válida,
 * sin `pre`/`post` previos): (1) pre-check, (2) lockProducts, (3) post-check,
 * (4) INSERT ON CONFLICT DO NOTHING (sin filas → conflicto), (5) fallback.
 */
function makeTx(onFallbackSelect: (arg: unknown) => void): DbTx {
  let call = 0
  const execute = vi.fn((_arg: unknown) => {
    call += 1
    switch (call) {
      case 1: // pre-check
        return Promise.resolve([])
      case 2: // lockProducts
        return Promise.resolve([PRODUCT_ROW])
      case 3: // post-check
        return Promise.resolve([])
      case 4: // INSERT ... ON CONFLICT DO NOTHING RETURNING * → conflicto
        return Promise.resolve([])
      case 5: // el fallback bajo la lupa
        onFallbackSelect(_arg)
        return Promise.resolve([
          {
            id: 'tab-other-tenant',
            tenant_id: 'tenant-B-ajeno',
            debtor_name: 'Cliente ajeno',
            status: 'open',
            total_amount: 500,
            note: null,
            created_by: 'staff-otro',
            created_at: new Date().toISOString(),
            settled_at: null,
            settled_by: null,
            settled_cash_flow_id: null,
            canceled_at: null,
            canceled_by: null,
            canceled_reason: null,
          },
        ])
      default:
        return Promise.resolve([])
    }
  })
  return { execute } as unknown as DbTx
}

const input: CreateTabInput = {
  debtorName: 'Juan',
  lines: [{ productId: 'prod-1', qty: 1 }],
  clientIdempotencyKey: 'idem-key-1',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createTab — el fallback SELECT tras ON CONFLICT filtra por tenant_id explícito', () => {
  it('el SQL del fallback liga tenant_id además de client_idempotency_key', async () => {
    let captured: unknown
    const tx = makeTx((arg) => {
      captured = arg
    })

    await createTab(TENANT_A, 'staff-1', input, tx)

    expect(captured).toBeDefined()
    expect(sqlText(captured)).toMatch(/tenant_id/)
    expect(sqlValues(captured)).toContain(TENANT_A)
  })
})
