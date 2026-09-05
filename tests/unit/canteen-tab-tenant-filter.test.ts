import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { createTab } from '@/modules/canteen/canteen-tab.service'

// Hallazgo #8 (campaña de mutación, docs/qa/TEST_AUDIT.md): el índice único de
// client_idempotency_key en canteen_tabs es GLOBAL (migr. 048), sin tenant_id.
// Los tres SELECTs de dedupe de createTab (fast path pre-lock, re-check bajo
// lock, fallback tras perder la carrera del INSERT) deben filtrar por
// tenant_id explícitamente además de RLS (CLAUDE.md), o un complejo B puede
// leer y devolver como propio un fiado creado por el complejo A.

const TENANT_ID = 'tenant-1'
const STAFF_ID = 'staff-1'
const PRODUCT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const KEY = '77777777-7777-4777-8777-777777777777'

const existingTabRow = {
  id: 'tab-1',
  tenant_id: TENANT_ID,
  debtor_name: 'Fulano',
  status: 'open',
  total_amount: 100_00,
  note: null,
  created_by: STAFF_ID,
  created_at: '2026-01-01T00:00:00.000Z',
  settled_at: null,
  settled_by: null,
  settled_cash_flow_id: null,
  canceled_at: null,
  canceled_by: null,
  canceled_reason: null,
}

function mockTx(responses: unknown[][]) {
  const execute = vi.fn()
  for (const r of responses) execute.mockResolvedValueOnce(r)
  return { execute } as never
}

describe('createTab — dedupe por clientIdempotencyKey filtra por tenant', () => {
  it('los 3 SELECTs por client_idempotency_key filtran por tenant_id', async () => {
    const dialect = new PgDialect()
    const tx = mockTx([
      [], // fast path pre-lock: sin duplicado
      [{ id: PRODUCT_ID, name: 'Gaseosa', price: 100_00, stock: null, is_active: true }], // lockProducts
      [], // re-check bajo lock: sin duplicado
      [], // INSERT ... ON CONFLICT DO NOTHING: conflicto, sin fila devuelta
      [existingTabRow], // fallback tras perder la carrera
    ])

    const result = await createTab(
      TENANT_ID,
      STAFF_ID,
      {
        debtorName: 'Fulano',
        lines: [{ productId: PRODUCT_ID, qty: 1 }],
        clientIdempotencyKey: KEY,
      },
      tx,
    )

    expect(result.duplicate).toBe(true)
    expect(result.tab.id).toBe('tab-1')

    const queries = vi.mocked(tx.execute).mock.calls.map(([q]) => dialect.sqlToQuery(q as SQL))
    const dedupeQueries = queries.filter((q) => q.sql.includes('client_idempotency_key'))
    expect(dedupeQueries.length).toBeGreaterThanOrEqual(3)
    for (const q of dedupeQueries) {
      expect(q.sql).toMatch(/tenant_id/)
      expect(q.params).toContain(TENANT_ID)
    }
  })
})
