import { beforeEach, describe, expect, it, vi } from 'vitest'

// B2: `provisionAndRouteStaff` copia `user_metadata.referral_code` a
// `staff_users.signup_referral_code` SOLO en el INSERT (alta nueva, sin
// staff_user_id en metadata) — nunca en un UPDATE. Mismo patrón de router de
// queries que provision-and-route-staff-identity.test.ts.

vi.mock('@/shared/db/client', () => ({ getWorkerSql: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/shared/observability', () => ({ track: { auth: vi.fn() } }))

import { getWorkerSql } from '@/shared/db/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { provisionAndRouteStaff } from '@/modules/auth/auth.service'

const mockGetWorkerSql = getWorkerSql as ReturnType<typeof vi.fn>
const mockCreateClient = createClient as ReturnType<typeof vi.fn>
const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>

/** Router de queries que además captura los VALORES interpolados de cada
 * llamada (no solo el texto), para poder afirmar qué se mandó al INSERT. */
function makeSqlRouter(handlers: Array<{ match: RegExp; rows: unknown[] }>) {
  const calls: Array<{ text: string; values: unknown[] }> = []
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?')
    calls.push({ text, values })
    const handler = handlers.find((h) => h.match.test(text))
    if (!handler) throw new Error(`Unhandled query in test: ${text}`)
    return Promise.resolve(handler.rows)
  })
  return { sql, calls }
}

const refreshSession = vi.fn().mockResolvedValue({ data: {}, error: null })
const updateUserById = vi.fn().mockResolvedValue({ error: null })

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateClient.mockResolvedValue({ auth: { refreshSession } } as never)
  mockCreateAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } } as never)
  refreshSession.mockResolvedValue({ data: {}, error: null })
  updateUserById.mockResolvedValue({ error: null })
})

describe('provisionAndRouteStaff — captura del código de referido (B2)', () => {
  it('alta nueva con referral_code válido en user_metadata → lo copia en el INSERT', async () => {
    const { sql, calls } = makeSqlRouter([
      { match: /SELECT id FROM staff_users WHERE email/, rows: [] },
      { match: /INSERT INTO staff_users/, rows: [{ id: 'staff-new' }] },
      { match: /FROM tenant_staff_members/, rows: [] },
      { match: /UPDATE staff_users SET last_login_at/, rows: [] },
    ])
    mockGetWorkerSql.mockReturnValue(sql as unknown as ReturnType<typeof getWorkerSql>)

    const user = {
      id: 'auth-2',
      email: 'primeravez@complejo.com',
      app_metadata: {},
      user_metadata: { first_name: 'Marce', last_name: 'Dueño', referral_code: 'AH2K9MZP' },
    }

    const result = await provisionAndRouteStaff(user as never)

    expect(result).toEqual({ path: '/onboarding' })
    const insertCall = calls.find((c) => /INSERT INTO staff_users/.test(c.text))
    expect(insertCall).toBeDefined()
    expect(insertCall?.values).toContain('AH2K9MZP')
  })

  it('alta nueva con referral_code de formato inválido → se descarta, INSERT con null', async () => {
    const { sql, calls } = makeSqlRouter([
      { match: /SELECT id FROM staff_users WHERE email/, rows: [] },
      { match: /INSERT INTO staff_users/, rows: [{ id: 'staff-new' }] },
      { match: /FROM tenant_staff_members/, rows: [] },
      { match: /UPDATE staff_users SET last_login_at/, rows: [] },
    ])
    mockGetWorkerSql.mockReturnValue(sql as unknown as ReturnType<typeof getWorkerSql>)

    const user = {
      id: 'auth-2',
      email: 'primeravez@complejo.com',
      app_metadata: {},
      user_metadata: { first_name: 'Marce', last_name: 'Dueño', referral_code: 'algo-invalido' },
    }

    const result = await provisionAndRouteStaff(user as never)

    expect(result).toEqual({ path: '/onboarding' })
    const insertCall = calls.find((c) => /INSERT INTO staff_users/.test(c.text))
    expect(insertCall?.values).not.toContain('algo-invalido')
    expect(insertCall?.values).toContain(null)
  })

  it('login de una cuenta ya existente (con staff_user_id en metadata) nunca inserta ni toca el código', async () => {
    const { sql, calls } = makeSqlRouter([
      { match: /SELECT id FROM staff_users WHERE id/, rows: [{ id: 'staff-1' }] },
      {
        match: /FROM tenant_staff_members/,
        rows: [{ tenantId: 'tenant-1', tenantName: 'Demo FC', tenantSlug: 'demo', role: 'admin' }],
      },
      { match: /UPDATE staff_users SET last_login_at/, rows: [] },
    ])
    mockGetWorkerSql.mockReturnValue(sql as unknown as ReturnType<typeof getWorkerSql>)

    const user = {
      id: 'auth-1',
      email: 'ya@complejo.com',
      app_metadata: { staff_user_id: 'staff-1', tenant_id: 'tenant-1', role: 'admin' },
      user_metadata: { referral_code: 'AH2K9MZP' },
    }

    const result = await provisionAndRouteStaff(user as never)

    expect(result).toEqual({ path: '/dashboard' })
    expect(calls.some((c) => /INSERT INTO staff_users/.test(c.text))).toBe(false)
  })
})
