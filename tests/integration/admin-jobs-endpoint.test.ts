import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '@/modules/auth/types'

// Only the auth boundary is mocked; getBoss() hits the real local pg-boss.
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { stopBoss } from '@/shared/jobs/boss'
import { ALL_QUEUES } from '@/shared/jobs/dlq'
import { GET as getJobs } from '@/app/api/admin/jobs/route'

const asUser = (user: AuthUser | null) =>
  vi.mocked(extractAuthUser).mockResolvedValue(user)

beforeEach(() => {
  vi.clearAllMocks()
})

afterAll(async () => {
  // getBoss() started a singleton in the system_admin case — close it so the
  // pg-boss pollers don't leave open handles.
  await stopBoss()
})

describe('GET /api/admin/jobs (queue depth — B10 T7)', () => {
  it('returns 403 when unauthenticated', async () => {
    asUser(null)
    const res = await getJobs()
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('returns 403 for a non-admin (player)', async () => {
    asUser({ type: 'player', id: 'auth-1', playerId: 'p1', email: 'p@test.local' })
    const res = await getJobs()
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('returns 200 with queue depths for a system_admin', async () => {
    asUser({
      type: 'system_admin',
      id: 'auth-1',
      email: 'admin@test.local',
      systemAdminId: 'sa-1',
    })
    const res = await getJobs()
    expect(res.status).toBe(200)

    const json = (await res.json()) as {
      queues: { queue: string; depth: number | null; error?: string }[]
      timestamp: string
    }
    expect(Array.isArray(json.queues)).toBe(true)
    expect(json.queues).toHaveLength(ALL_QUEUES.length)
    expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const names = json.queues.map((q) => q.queue).sort()
    expect(names).toEqual([...ALL_QUEUES].sort())

    // Depth from the real local pg-boss is a non-negative integer (queues may
    // be empty → 0). A null depth would mean getQueueSize threw for that queue.
    for (const q of json.queues) {
      expect(q.depth).not.toBeNull()
      expect(typeof q.depth).toBe('number')
      expect(q.depth as number).toBeGreaterThanOrEqual(0)
    }
  })
})
