import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hallazgo #8 (campaña de mutación, docs/qa/TEST_AUDIT.md): el SELECT de
// fallback que recupera la fila tras un `ON CONFLICT (client_idempotency_key)
// DO NOTHING` filtraba SOLO por `client_idempotency_key`, sin `tenant_id`. El
// índice único de esa columna es GLOBAL (migr. 023) — CLAUDE.md pide el
// filtro explícito SIEMPRE, además de RLS, porque en dev la app conecta como
// superusuario y RLS no aplica. Este test verifica el SQL efectivamente
// enviado a la DB en ese fallback, no un resultado simulado: inspecciona los
// `queryChunks` del objeto `SQL` de Drizzle que llega a `tx.execute()`.

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

import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import type { DbTx } from '@/shared/db/client'
import type { CreateCashFlowInput } from '@/modules/cashflow/cashflow.types'

const TENANT_A = 'tenant-a-uuid'
const CLIENT_KEY = 'idem-key-1'

function makeTx(onFallbackSelect: (arg: unknown) => void): DbTx {
  let call = 0
  const execute = vi.fn((_arg: unknown) => {
    call += 1
    switch (call) {
      case 1: // assertDayOpen: pg_advisory_xact_lock
        return Promise.resolve([])
      case 2: // assertDayOpen: SELECT opening_hours FROM tenants
        return Promise.resolve([])
      case 3: // assertDayOpen: SELECT id FROM daily_cash_closes
        return Promise.resolve([])
      case 4: // INSERT ... ON CONFLICT (client_idempotency_key) DO NOTHING RETURNING * → conflicto, sin filas
        return Promise.resolve([])
      case 5: // el fallback bajo la lupa
        onFallbackSelect(_arg)
        // Fila que "ya existía" — de OTRO tenant. Si el fallback no filtra por
        // tenant_id, esta es la fila que se devuelve (leak cross-tenant).
        return Promise.resolve([
          {
            id: 'cf-other-tenant',
            tenant_id: 'tenant-B-ajeno',
            type: 'income',
            category: 'other',
            amount: 999,
            method: 'cash',
            description: 'movimiento de otro complejo',
            booking_id: null,
            tournament_team_id: null,
            registered_by: 'staff-otro',
            occurred_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ])
      default:
        return Promise.resolve([])
    }
  })
  return { execute } as unknown as DbTx
}

const input: CreateCashFlowInput = {
  type: 'income',
  category: 'other',
  amount: 1000,
  method: 'cash',
  description: 'x',
  clientIdempotencyKey: CLIENT_KEY,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createCashFlow — el fallback SELECT tras ON CONFLICT filtra por tenant_id explícito', () => {
  it('el SQL del fallback liga tenant_id además de client_idempotency_key', async () => {
    let captured: unknown
    const tx = makeTx((arg) => {
      captured = arg
    })

    await createCashFlow(TENANT_A, 'staff-1', input, tx)

    expect(captured).toBeDefined()
    expect(sqlText(captured)).toMatch(/tenant_id/)
    expect(sqlValues(captured)).toContain(TENANT_A)
  })
})
