import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fase 7 del plan de refactor de onboarding (§D "abandona y vuelve"): mismo
// patrón de mocks que reconcile-pending-payments-worker.test.ts — getWorkerSql
// como stub de template-tag, getWorkerDb().transaction con un tx falso.

vi.mock('@/shared/db/client', () => ({
  getWorkerSql: vi.fn(),
  getWorkerDb: vi.fn(),
}))
vi.mock('@/modules/notifications/notification.service', () => ({
  enqueueTenantOwnerNotification: vi.fn(async () => ['notif-1']),
}))
vi.mock('@/shared/observability/breadcrumbs', () => ({
  track: { onboarding: vi.fn() },
}))
vi.mock('@/shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { getWorkerSql, getWorkerDb } from '@/shared/db/client'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { track } from '@/shared/observability/breadcrumbs'
import { runOnboardingAbandonmentSweep } from '@/shared/jobs/workers/onboarding-abandonment.worker'

const mockGetWorkerSql = vi.mocked(getWorkerSql)
const mockGetWorkerDb = vi.mocked(getWorkerDb)

const CANDIDATE = {
  id: 'tenant-1',
  name: 'Complejo Norte',
  onboarding_step: 2,
  owner_name: 'Marcelo',
}

// El worker hace UNA sola escritura dentro de la transacción: el
// UPDATE...RETURNING de la marca de idempotencia. El nombre del dueño ya no se
// busca acá — viene por LATERAL en la query de candidatos, que corre en el pool
// worker antes del loop.
function fakeTx(claimRows: Array<{ id: string }>) {
  return { execute: vi.fn(async () => claimRows) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runOnboardingAbandonmentSweep', () => {
  it('sin candidatos, no toca la DB de escritura ni emite analytics', async () => {
    mockGetWorkerSql.mockReturnValue(
      vi.fn(async () => []) as unknown as ReturnType<typeof getWorkerSql>,
    )
    const dbTransaction = vi.fn()
    mockGetWorkerDb.mockReturnValue({ transaction: dbTransaction } as unknown as ReturnType<
      typeof getWorkerDb
    >)

    await runOnboardingAbandonmentSweep()

    expect(dbTransaction).not.toHaveBeenCalled()
    expect(vi.mocked(track.onboarding)).not.toHaveBeenCalled()
  })

  it('candidato ganado (UPDATE afecta 1 fila): encola el mail y emite onboarding.abandoned', async () => {
    mockGetWorkerSql.mockReturnValue(
      vi.fn(async () => [CANDIDATE]) as unknown as ReturnType<typeof getWorkerSql>,
    )
    const tx = fakeTx([{ id: CANDIDATE.id }])
    mockGetWorkerDb.mockReturnValue({
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(tx),
    } as unknown as ReturnType<typeof getWorkerDb>)

    await runOnboardingAbandonmentSweep()

    expect(vi.mocked(enqueueTenantOwnerNotification)).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        templateName: 'onboarding_abandoned',
        content: expect.objectContaining({ ownerName: 'Marcelo', lastStepLabel: 'Horarios' }),
      }),
      tx,
    )
    expect(vi.mocked(track.onboarding)).toHaveBeenCalledWith('onboarding.abandoned', {
      tenantId: 'tenant-1',
      lastStep: 2,
    })
  })

  // Dos corridas del cron se pisan (o el sweep tarda y otra ya marcó al tenant):
  // el UPDATE...RETURNING de la marca de idempotencia afecta 0 filas — la
  // pérdida de la carrera NO debe mandar un segundo mail ni un segundo evento.
  it('candidato perdido (UPDATE afecta 0 filas, otra corrida ya ganó): no manda mail ni emite el evento', async () => {
    mockGetWorkerSql.mockReturnValue(
      vi.fn(async () => [CANDIDATE]) as unknown as ReturnType<typeof getWorkerSql>,
    )
    const tx = fakeTx([])
    mockGetWorkerDb.mockReturnValue({
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(tx),
    } as unknown as ReturnType<typeof getWorkerDb>)

    await runOnboardingAbandonmentSweep()

    expect(vi.mocked(enqueueTenantOwnerNotification)).not.toHaveBeenCalled()
    expect(vi.mocked(track.onboarding)).not.toHaveBeenCalled()
  })

  it('sin onboarding_step guardado (paso 1, todavía sin completar ninguno): usa el label del paso 1', async () => {
    mockGetWorkerSql.mockReturnValue(
      vi.fn(async () => [
        { id: 'tenant-2', name: 'Complejo Sur', onboarding_step: null, owner_name: 'Marcelo' },
      ]) as unknown as ReturnType<typeof getWorkerSql>,
    )
    const tx = fakeTx([{ id: 'tenant-2' }])
    mockGetWorkerDb.mockReturnValue({
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(tx),
    } as unknown as ReturnType<typeof getWorkerDb>)

    await runOnboardingAbandonmentSweep()

    expect(vi.mocked(enqueueTenantOwnerNotification)).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ lastStepLabel: 'Tu complejo' }),
      }),
      tx,
    )
  })
})
