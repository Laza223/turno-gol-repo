import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '@/modules/auth/types'

// Only the auth boundary is mocked; getBoss() hits the real local pg-boss.
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(),
  extractRealAuthUser: vi.fn(),
}))

import { extractAuthUser, extractRealAuthUser } from '@/modules/auth/auth.middleware'
import { getSql } from '@/shared/db/client'
import { stopBoss } from '@/shared/jobs/boss'
import { ALL_QUEUES } from '@/shared/jobs/dlq'
import { GET as getJobs } from '@/app/api/admin/jobs/route'
import { createTestSystemAdmin, ensureRoles } from '../helpers/tenant'

const asUser = (user: AuthUser | null) => {
  vi.mocked(extractAuthUser).mockResolvedValue(user)
  vi.mocked(extractRealAuthUser).mockResolvedValue(user)
}

// resolveSystemAdmin() no confía en el claim JWT: valida contra una fila activa
// en system_admins (RLS self-only) + el email de esa fila en SYSTEM_ADMIN_EMAILS.
// El id debe ser un UUID real de la DB (el 'sa-1' viejo rompía con 22P02).
let systemAdminId: string
let savedAllowlist: string | undefined

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  const sa = await createTestSystemAdmin(sql)
  systemAdminId = sa.id
  savedAllowlist = process.env.SYSTEM_ADMIN_EMAILS
  process.env.SYSTEM_ADMIN_EMAILS = sa.email
}, 30_000)

beforeEach(() => {
  vi.clearAllMocks()
})

afterAll(async () => {
  if (savedAllowlist === undefined) delete process.env.SYSTEM_ADMIN_EMAILS
  else process.env.SYSTEM_ADMIN_EMAILS = savedAllowlist
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
      systemAdminId,
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
