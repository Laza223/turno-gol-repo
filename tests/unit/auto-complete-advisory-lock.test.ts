import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import {
  autoCompleteOverdueBookings,
  AUTO_COMPLETE_LOCK_KEY,
} from '@/modules/bookings/booking.service'
import type { DbTx } from '@/shared/db/client'

// The auto-complete cron runs every 30 min and can overlap a manual trigger.
// Without serialization, two runs could double-process the same overdue set.
// The function must take a transaction-scoped advisory lock BEFORE the UPDATE.
const dialect = new PgDialect()

function fakeTx() {
  const queries: Array<{ sql: string; params: unknown[] }> = []
  const execute = vi.fn(async (q: SQL) => {
    queries.push(dialect.sqlToQuery(q))
    return [] as unknown[]
  })
  return { tx: { execute } as unknown as DbTx, queries, execute }
}

describe('autoCompleteOverdueBookings advisory lock', () => {
  it('acquires a transaction-scoped advisory lock keyed on the job name', async () => {
    const { tx, queries } = fakeTx()

    await autoCompleteOverdueBookings(tx)

    expect(queries.length).toBeGreaterThanOrEqual(2)
    const lock = queries[0]!
    expect(lock.sql).toContain('pg_advisory_xact_lock')
    expect(lock.sql).toContain('hashtext')
    expect(lock.params).toContain(AUTO_COMPLETE_LOCK_KEY)
  })

  it('takes the lock before the UPDATE (serializes parallel cron runs)', async () => {
    const { tx, queries } = fakeTx()

    await autoCompleteOverdueBookings(tx)

    const lockIdx = queries.findIndex((q) => q.sql.includes('pg_advisory_xact_lock'))
    const updateIdx = queries.findIndex((q) => /update\s+"?bookings"?/i.test(q.sql))
    expect(lockIdx).toBe(0)
    expect(updateIdx).toBeGreaterThan(lockIdx)
  })
})
