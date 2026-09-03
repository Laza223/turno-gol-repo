import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DrizzleQueryError } from 'drizzle-orm/errors'

// Hallazgo #2 (campaña de mutación, docs/qa/TEST_AUDIT.md): closeDailyRegister
// usaba `isUniqueViolation` local, que mira `err.code` en el nivel superior.
// Drizzle 0.45 envuelve lo que tira postgres-js en un `DrizzleQueryError`: el
// `code` y `constraint_name` viajan en `cause`, no en el error de arriba (ver
// src/modules/tournaments/pg-errors.ts). El INSERT de closeDailyRegister va
// por `.insert(dailyCashCloses).values().returning()` (query builder) — así
// que el 23505 nunca lo reconocía y el cierre concurrente tiraba un error
// crudo en vez de `DayAlreadyCloseExistsError`.
//
// Este test reproduce el shape REAL de Drizzle (misma clase `DrizzleQueryError`
// que usa el runtime) envolviendo un error de postgres-js con `code: '23505'`
// y `constraint_name: 'uq_daily_close_per_tenant'` en `cause`.

vi.mock('@/shared/db/audit', () => ({
  insertAuditLog: vi.fn(),
}))

import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import { DayAlreadyCloseExistsError } from '@/modules/cashflow/cashflow.errors'
import type { DbTx } from '@/shared/db/client'

function pgUniqueViolationError(constraintName: string): unknown {
  const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    constraint_name: constraintName,
  })
  return new DrizzleQueryError('INSERT INTO daily_cash_closes ...', [], pgError)
}

function makeTx(): DbTx {
  // execute() se llama, en orden: advisory lock, existing-check, aggregateTotals, openingCash.
  const executeResults: unknown[][] = [[], [], [], []]
  let callIndex = 0
  const execute = vi.fn(() => Promise.resolve(executeResults[callIndex++] ?? []))

  const returning = vi.fn().mockRejectedValue(pgUniqueViolationError('uq_daily_close_per_tenant'))
  const values = vi.fn(() => ({ returning }))
  const insert = vi.fn(() => ({ values }))

  return { execute, insert } as unknown as DbTx
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('closeDailyRegister — 23505 envuelto por Drizzle 0.45 se traduce a DayAlreadyCloseExistsError', () => {
  it('el INSERT concurrente que choca contra uq_daily_close_per_tenant no escapa como error crudo', async () => {
    const tx = makeTx()

    await expect(
      closeDailyRegister('tenant-1', '2026-09-03', 'staff-1', {}, 0, tx),
    ).rejects.toBeInstanceOf(DayAlreadyCloseExistsError)
  })
})
