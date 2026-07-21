import { beforeEach, describe, expect, it, vi } from 'vitest'

// Bug: updateUserEmailAction cambia el email en Supabase Auth pero
// staff_users.email nunca se sincronizaba. provisionAndRouteStaff resolvía
// identidad por email (getOrCreateStaffUser) → tras confirmar el email nuevo,
// el admin caía en un staff_user huérfano sin tenants (expulsado a
// /onboarding). Fix: si el JWT ya trae `staff_user_id` en app_metadata,
// resolver por ESE id (SELECT por id) en vez de por email. El fallback a
// email/creación solo aplica cuando no hay staff_user_id (alta nueva).

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

/** Router de queries: cada llamada a `sql` (tagged template) se resuelve según
 * qué texto contiene, igual que resolve-staff-tenants.test.ts pero con más de
 * un patrón posible en el mismo test. */
function makeSqlRouter(handlers: Array<{ match: RegExp; rows: unknown[] }>) {
  const calls: string[] = []
  const sql = vi.fn((strings: TemplateStringsArray) => {
    const text = strings.join('?')
    calls.push(text)
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

describe('provisionAndRouteStaff — resolución de identidad', () => {
  it('con staff_user_id en metadata, resuelve la fila vieja por id y NO crea una fila nueva', async () => {
    const { sql, calls } = makeSqlRouter([
      { match: /SELECT id FROM staff_users WHERE id/, rows: [{ id: 'staff-1' }] },
      {
        match: /FROM tenant_staff_members/,
        rows: [{ tenantId: 'tenant-1', tenantName: 'Demo FC', tenantSlug: 'demo', role: 'admin' }],
      },
    ])
    mockGetWorkerSql.mockReturnValue(sql as unknown as ReturnType<typeof getWorkerSql>)

    const user = {
      id: 'auth-1',
      email: 'nuevo@complejo.com', // email YA cambiado en Supabase Auth (post email_change)
      app_metadata: { staff_user_id: 'staff-1', tenant_id: 'tenant-1', role: 'admin' },
      user_metadata: {},
    }

    const result = await provisionAndRouteStaff(user as never)

    expect(result).toEqual({ path: '/dashboard' })
    // Nunca resolvió por email ni insertó una fila nueva.
    expect(calls.some((c) => /staff_users WHERE email/.test(c))).toBe(false)
    expect(calls.some((c) => /INSERT INTO staff_users/.test(c))).toBe(false)
    // setStaffTenantClaim usó el staff_user_id resuelto (id viejo), no uno nuevo.
    expect(updateUserById).toHaveBeenCalledWith(
      'auth-1',
      expect.objectContaining({
        app_metadata: expect.objectContaining({ staff_user_id: 'staff-1', tenant_id: 'tenant-1' }),
      }),
    )
  })

  it('sin staff_user_id en metadata (alta nueva), cae al lookup/creación por email', async () => {
    const { sql, calls } = makeSqlRouter([
      { match: /SELECT id FROM staff_users WHERE email/, rows: [] },
      { match: /INSERT INTO staff_users/, rows: [{ id: 'staff-new' }] },
      { match: /FROM tenant_staff_members/, rows: [] },
    ])
    mockGetWorkerSql.mockReturnValue(sql as unknown as ReturnType<typeof getWorkerSql>)

    const user = {
      id: 'auth-2',
      email: 'primeravez@complejo.com',
      app_metadata: {},
      user_metadata: { first_name: 'Marce', last_name: 'Dueño' },
    }

    const result = await provisionAndRouteStaff(user as never)

    expect(result).toEqual({ path: '/onboarding' })
    expect(calls.some((c) => /SELECT id FROM staff_users WHERE id/.test(c))).toBe(false)
    expect(calls.some((c) => /INSERT INTO staff_users/.test(c))).toBe(true)
  })

  it('con staff_user_id en metadata que ya no existe en staff_users, tira error explícito (no crea huérfano nuevo)', async () => {
    const { sql, calls } = makeSqlRouter([
      { match: /SELECT id FROM staff_users WHERE id/, rows: [] },
    ])
    mockGetWorkerSql.mockReturnValue(sql as unknown as ReturnType<typeof getWorkerSql>)

    const user = {
      id: 'auth-3',
      email: 'nuevo@complejo.com',
      app_metadata: { staff_user_id: 'staff-fantasma' },
      user_metadata: {},
    }

    await expect(provisionAndRouteStaff(user as never)).rejects.toThrow(/staff-fantasma/)
    expect(calls.some((c) => /INSERT INTO staff_users/.test(c))).toBe(false)
  })
})
