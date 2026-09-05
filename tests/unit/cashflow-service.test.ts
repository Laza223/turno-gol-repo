import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { validateCashFlowCombo, createCashFlow } from '@/modules/cashflow/cashflow.service'
import {
  InvalidCashFlowTypeError,
  InvalidCashFlowCategoryError,
} from '@/modules/cashflow/cashflow.errors'

describe('validateCashFlowCombo', () => {
  // 'expense' es válido desde la migración 025; la 050 amplió sus categorías
  // a 6 (operating_expense legacy + merchandise/salaries/utilities/
  // maintenance/other_expense — ver el describe de migr. 050 más abajo).
  // Este caso cubre categorías que NUNCA fueron válidas para 'expense'.
  it('rejects expense with income/adjustment-only categories', () => {
    expect(() => validateCashFlowCombo('expense', 'other')).toThrow(InvalidCashFlowCategoryError)
    expect(() => validateCashFlowCombo('expense', 'booking')).toThrow(InvalidCashFlowCategoryError)
  })

  it('accepts expense + operating_expense', () => {
    expect(() => validateCashFlowCombo('expense', 'operating_expense')).not.toThrow()
  })

  it('rejects income with operating_expense', () => {
    expect(() => validateCashFlowCombo('income', 'operating_expense')).toThrow(
      InvalidCashFlowCategoryError,
    )
  })

  it('rejects unknown type', () => {
    expect(() => validateCashFlowCombo('revenue', 'booking')).toThrow(InvalidCashFlowTypeError)
  })

  it('rejects income with no_show_correction', () => {
    expect(() => validateCashFlowCombo('income', 'no_show_correction')).toThrow(
      InvalidCashFlowCategoryError,
    )
  })

  it('rejects adjustment with booking', () => {
    expect(() => validateCashFlowCombo('adjustment', 'booking')).toThrow(
      InvalidCashFlowCategoryError,
    )
  })

  it('rejects adjustment with product_sale', () => {
    expect(() => validateCashFlowCombo('adjustment', 'product_sale')).toThrow(
      InvalidCashFlowCategoryError,
    )
  })

  it('accepts income + booking', () => {
    expect(() => validateCashFlowCombo('income', 'booking')).not.toThrow()
  })

  it('accepts income + product_sale', () => {
    expect(() => validateCashFlowCombo('income', 'product_sale')).not.toThrow()
  })

  it('accepts income + other', () => {
    expect(() => validateCashFlowCombo('income', 'other')).not.toThrow()
  })

  it('accepts adjustment + other', () => {
    expect(() => validateCashFlowCombo('adjustment', 'other')).not.toThrow()
  })

  it('accepts adjustment + no_show_correction', () => {
    expect(() => validateCashFlowCombo('adjustment', 'no_show_correction')).not.toThrow()
  })

  // migr. 050 — gastos categorizados: 5 categorías nuevas, todas válidas SOLO
  // con type 'expense'. 'operating_expense' (legacy) sigue vigente (la UI ya
  // no la ofrece, pero el service/DB la siguen aceptando para no romper filas
  // históricas).
  describe('migr. 050 — categorías de gasto nuevas', () => {
    it.each(['merchandise', 'salaries', 'utilities', 'maintenance', 'other_expense'])(
      'accepts expense + %s',
      (category) => {
        expect(() => validateCashFlowCombo('expense', category)).not.toThrow()
      },
    )

    it('operating_expense (legacy) sigue siendo válido con expense', () => {
      expect(() => validateCashFlowCombo('expense', 'operating_expense')).not.toThrow()
    })

    it('rejects income + merchandise (categoría de gasto en un ingreso)', () => {
      expect(() => validateCashFlowCombo('income', 'merchandise')).toThrow(
        InvalidCashFlowCategoryError,
      )
    })

    it.each(['salaries', 'utilities', 'maintenance', 'other_expense'])(
      'rejects adjustment + %s',
      (category) => {
        expect(() => validateCashFlowCombo('adjustment', category)).toThrow(
          InvalidCashFlowCategoryError,
        )
      },
    )
  })
})

// Hallazgo #8 (campaña de mutación, docs/qa/TEST_AUDIT.md): el índice único de
// client_idempotency_key en cash_flows es GLOBAL (migr. 023), sin tenant_id.
// Cuando el ON CONFLICT DO NOTHING pega (doble-submit o colisión cross-tenant
// de la key), el fallback que trae la fila existente debe filtrar por
// tenant_id explícitamente además de RLS (CLAUDE.md) — si no, un complejo B
// puede leer y devolver como propio un cash_flow insertado por el complejo A.
describe('createCashFlow — dedupe por clientIdempotencyKey filtra por tenant', () => {
  const TENANT_ID = 'tenant-1'
  const STAFF_ID = 'staff-1'
  const KEY = '66666666-6666-4666-8666-666666666666'

  function mockTx(responses: unknown[][]) {
    const execute = vi.fn()
    for (const r of responses) execute.mockResolvedValueOnce(r)
    return { execute } as never
  }

  it('el SELECT de fallback tras ON CONFLICT filtra por tenant_id', async () => {
    const dialect = new PgDialect()
    const existingRow = {
      id: 'cf-1',
      tenant_id: TENANT_ID,
      type: 'income',
      category: 'booking',
      amount: 100_00,
      method: 'cash',
      description: 'Cobro',
      booking_id: null,
      tournament_team_id: null,
      registered_by: STAFF_ID,
      occurred_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
    }
    const tx = mockTx([
      [], // advisory lock (assertDayOpen)
      [{ openingHours: {}, closesNextDay: false }], // tenant settings
      [], // closeCheck: día abierto
      [], // INSERT ... ON CONFLICT DO NOTHING: conflicto, sin fila devuelta
      [existingRow], // fallback SELECT de la fila existente
    ])

    const result = await createCashFlow(
      TENANT_ID,
      STAFF_ID,
      {
        type: 'income',
        category: 'booking',
        amount: 100_00,
        method: 'cash',
        description: 'Cobro',
        clientIdempotencyKey: KEY,
      },
      tx,
    )

    expect(result.id).toBe('cf-1')
    const queries = vi.mocked(tx.execute).mock.calls.map(([q]) => dialect.sqlToQuery(q as SQL))
    const fallbackQuery = queries.find(
      (q) => /SELECT \* FROM cash_flows/.test(q.sql) && q.sql.includes('client_idempotency_key'),
    )
    expect(fallbackQuery).toBeDefined()
    expect(fallbackQuery!.sql).toMatch(/tenant_id/)
    expect(fallbackQuery!.params).toContain(TENANT_ID)
  })
})
