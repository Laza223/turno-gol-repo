import { beforeEach, describe, expect, it, vi } from 'vitest'

// ENS-20: transitionToActiveFromAny (lifecycle.service.ts) es el corazón de la
// recuperación de dunning — reactiva un tenant desde canceled/churned/blocked/
// past_due/suspended y limpia las anclas de dunning (dunning_started_at,
// scheduled_deletion_at, canceled_at, cancellation_reason). No tenía NINGUNA
// cobertura (ni unit ni integration) pese a ser la pieza que onPaymentApproved
// invoca para el "recovery por UI" que pide el ticket.

vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: vi.fn() }))

import { transitionToActiveFromAny } from '@/modules/billing/lifecycle.service'
import { InvalidTransitionError } from '@/modules/billing/billing.errors'
import type { DbTx } from '@/shared/db/client'

function sqlText(query: unknown): string {
  const chunks = (query as { queryChunks: unknown[] }).queryChunks
  return chunks
    .map((c) =>
      c && typeof c === 'object' && 'value' in (c as object)
        ? (c as { value: string[] }).value.join('')
        : '?',
    )
    .join('')
}

function makeTx(rowsPerCall: unknown[][]) {
  const execute = vi.fn()
  for (const rows of rowsPerCall) execute.mockResolvedValueOnce(rows)
  return { execute } as unknown as DbTx
}

const TENANT_ID = 't-1'
const PERIOD_START = new Date('2027-01-01T00:00:00Z')
const PERIOD_END = new Date('2027-02-01T00:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('transitionToActiveFromAny — recovery de dunning (ENS-20)', () => {
  it('el WHERE de tenant_subscriptions habilita canceled/churned/blocked/past_due/suspended', async () => {
    const tx = makeTx([[{ id: 'sub-1' }], []])
    await transitionToActiveFromAny(TENANT_ID, PERIOD_START, PERIOD_END, tx)

    const subUpdateText = sqlText(vi.mocked(tx.execute).mock.calls[0]![0])
    expect(subUpdateText).toContain(
      "status IN ('canceled', 'churned', 'blocked', 'past_due', 'suspended')",
    )

    const tenantUpdateText = sqlText(vi.mocked(tx.execute).mock.calls[1]![0])
    expect(tenantUpdateText).toContain(
      "status IN ('canceled', 'churned', 'blocked', 'past_due', 'suspended')",
    )
  })

  it('limpia dunning_started_at, scheduled_deletion_at, canceled_at y cancellation_reason', async () => {
    const tx = makeTx([[{ id: 'sub-1' }], []])
    await transitionToActiveFromAny(TENANT_ID, PERIOD_START, PERIOD_END, tx)

    const subUpdateText = sqlText(vi.mocked(tx.execute).mock.calls[0]![0])
    expect(subUpdateText).toContain('dunning_started_at = NULL')
    expect(subUpdateText).toContain('scheduled_deletion_at = NULL')
    expect(subUpdateText).toContain('canceled_at = NULL')
    expect(subUpdateText).toContain('cancellation_reason = NULL')

    const tenantUpdateText = sqlText(vi.mocked(tx.execute).mock.calls[1]![0])
    expect(tenantUpdateText).toContain('scheduled_deletion_at = NULL')
  })

  it('lanza InvalidTransitionError si el UPDATE no afecta filas (tenant no está en un estado elegible)', async () => {
    const tx = makeTx([[]])
    await expect(
      transitionToActiveFromAny(TENANT_ID, PERIOD_START, PERIOD_END, tx),
    ).rejects.toBeInstanceOf(InvalidTransitionError)
  })
})
