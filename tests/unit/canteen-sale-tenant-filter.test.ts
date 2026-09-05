import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

// Hallazgo #8 (campaña de mutación, docs/qa/TEST_AUDIT.md): el índice único de
// client_idempotency_key en cash_flows es GLOBAL (migr. 023), sin tenant_id.
// Los dos SELECTs de dedupe de sellTicket (fast path pre-lock y re-check bajo
// lock) deben filtrar por tenant_id explícitamente además de RLS (CLAUDE.md),
// o un complejo B puede leer y devolver como propio un cash_flow insertado
// por el complejo A.

vi.mock('@/modules/cashflow/cashflow.service', () => ({ createCashFlow: vi.fn() }))

import { sellTicket } from '@/modules/canteen/canteen-sale.service'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'

const TENANT_ID = 'tenant-1'
const STAFF_ID = 'staff-1'
const PRODUCT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const KEY = '88888888-8888-4888-8888-888888888888'

function mockTx(responses: unknown[][]) {
  const execute = vi.fn()
  for (const r of responses) execute.mockResolvedValueOnce(r)
  return { execute } as never
}

describe('sellTicket — dedupe por clientIdempotencyKey filtra por tenant', () => {
  it('los 2 SELECTs de dedupe (pre-lock y re-check) filtran por tenant_id', async () => {
    const dialect = new PgDialect()
    const tx = mockTx([
      [], // (1) fast path pre-lock: sin duplicado
      [{ id: PRODUCT_ID, name: 'Gaseosa', price: 100_00, stock: null, is_active: true }], // lockProducts
      [], // (2) re-check bajo lock: sin duplicado
    ])
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-1' } as never)

    const result = await sellTicket(
      TENANT_ID,
      STAFF_ID,
      { lines: [{ productId: PRODUCT_ID, qty: 1 }], method: 'cash', clientIdempotencyKey: KEY },
      tx,
    )

    expect(result.duplicate).toBe(false)
    const queries = vi.mocked(tx.execute).mock.calls.map(([q]) => dialect.sqlToQuery(q as SQL))
    const dedupeQueries = queries.filter((q) => q.sql.includes('client_idempotency_key'))
    expect(dedupeQueries.length).toBe(2)
    for (const q of dedupeQueries) {
      expect(q.sql).toMatch(/tenant_id/)
      expect(q.params).toContain(TENANT_ID)
    }
  })
})
