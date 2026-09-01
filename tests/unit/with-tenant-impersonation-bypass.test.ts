/**
 * `withTenant` y la impersonación de SuperAdmin.
 *
 * El bypass del lock de ciclo de vida existía en el camino de páginas y Server
 * Actions (`isBlockedForStaff`, guards.ts) pero NO en `withTenant`, que es por
 * donde pasan los 12 route handlers. El reparto quedaba al revés: durante una
 * impersonación se podían crear reservas y mover caja —las Server Actions sí
 * tienen el bypass— pero no LEER las métricas, porque el route handler
 * respondía 403 mientras la página que lo llama cargaba entera. El gate laxo
 * en el camino que muta, el estricto en el que sólo lee.
 *
 * El riesgo real de este cambio es aflojar el gate para TODOS, así que el test
 * que más importa es el negativo: sin impersonación, un complejo bloqueado
 * sigue cortado. Los `it` de abajo están escritos con ese orden de prioridad.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined, set: () => {} }),
}))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: actual.cache ?? (<T>(fn: T): T => fn) }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))
vi.mock('@/modules/auth/impersonation.server', () => ({ getImpersonationSession: vi.fn() }))

const h = vi.hoisted(() => ({ getSql: vi.fn(), withTenantContext: vi.fn() }))
vi.mock('@/shared/db/client', () => ({
  getSql: h.getSql,
  withTenantContext: h.withTenantContext,
}))

import { createClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/modules/staff/staff.service'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { withTenant } from '@/server/middleware/with-tenant'

const mockCreateClient = vi.mocked(createClient)
const mockGetImpersonationSession = vi.mocked(getImpersonationSession)

const TENANT_ID = 't-1'
const SYSTEM_ADMIN_ID = '22222222-2222-4222-8222-222222222222'

function setSupabaseUser(): void {
  mockCreateClient.mockReturnValue({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: 'staff-1',
            email: 'a@b.com',
            app_metadata: { tenant_id: TENANT_ID, staff_user_id: 'staff-1' },
          },
        },
        error: null,
      }),
    },
  } as unknown as ReturnType<typeof createClient>)
}

function makeRequest(method = 'GET'): NextRequest {
  return new NextRequest('http://localhost/api/reports/revenue', { method })
}

function mockTenantStatus(status: string) {
  h.getSql.mockReturnValue(vi.fn().mockResolvedValue([{ status }]))
}

/** Sesión de impersonación válida, como la devuelve `getImpersonationSessionFor`. */
function impersonando(): void {
  mockGetImpersonationSession.mockResolvedValue({
    systemAdminId: SYSTEM_ADMIN_ID,
    tenantId: TENANT_ID,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setSupabaseUser()
  vi.mocked(getStaffRole).mockResolvedValue('admin')
  mockGetImpersonationSession.mockResolvedValue(null)
  h.withTenantContext.mockImplementation((async (
    _id: string,
    cb: (tx: never) => Promise<unknown>,
  ) => cb({} as never)) as never)
})

describe('withTenant — el gate SIN impersonación no se afloja', () => {
  it.each(['blocked', 'churned', 'deleted'])('un complejo %s sigue cortado con 403', async (s) => {
    mockTenantStatus(s)
    const handler = withTenant(async () => NextResponse.json({ ok: true }))
    const res = await handler(makeRequest())
    expect(res.status).toBe(403)
  })

  it('un complejo suspendido sigue siendo sólo-lectura para las mutaciones', async () => {
    mockTenantStatus('suspended')
    const handler = withTenant(async () => NextResponse.json({ ok: true }))
    expect((await handler(makeRequest('POST'))).status).toBe(403)
    // El GET nunca estuvo cortado para `suspended`: es sólo-lectura, no bloqueo.
    expect((await handler(makeRequest('GET'))).status).toBe(200)
  })

  it('no paga la consulta de impersonación cuando el complejo está sano', async () => {
    // Es una lectura de cookie más una verificación en base en cada lectura:
    // no tiene por qué pagarla el 99% de las requests de un complejo activo.
    mockTenantStatus('active')
    const handler = withTenant(async () => NextResponse.json({ ok: true }))
    expect((await handler(makeRequest())).status).toBe(200)
    expect(mockGetImpersonationSession).not.toHaveBeenCalled()
  })
})

describe('withTenant — la impersonación entra al complejo bloqueado', () => {
  it.each(['blocked', 'churned', 'deleted'])(
    'soporte puede leer un complejo %s durante una impersonación',
    async (s) => {
      mockTenantStatus(s)
      impersonando()
      const handler = withTenant(async () => NextResponse.json({ ok: true }))
      const res = await handler(makeRequest())
      expect(res.status).toBe(200)
    },
  )

  it('el CSV de /analiticas deja de bajar el JSON de un 403', async () => {
    // El síntoma concreto que destapó esta clase: `Exportar CSV` es un
    // `<a href>` directo a /api/reports/revenue, así que durante una
    // impersonación navegaba al JSON del error en vez de bajar el archivo.
    mockTenantStatus('blocked')
    impersonando()
    const handler = withTenant(async () => NextResponse.json({ ok: true }))
    expect((await handler(makeRequest('GET'))).status).toBe(200)
  })

  it('también destraba las mutaciones sobre un complejo suspendido', async () => {
    mockTenantStatus('suspended')
    impersonando()
    const handler = withTenant(async () => NextResponse.json({ ok: true }))
    expect((await handler(makeRequest('POST'))).status).toBe(200)
  })
})
