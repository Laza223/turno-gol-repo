import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Fase 0 🔴 §4.6: el callback mandaba SIEMPRE 'exchange_failed' a /verify sin
// importar la causa real — el copy 'expired' de verify/page.tsx quedaba muerto
// (nunca se emitía). Fix: inspeccionar error.code de verifyOtp, igual que
// reset-password/actions.ts hace con 'same_password'.

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/modules/auth/auth.service', () => ({
  provisionAndRouteStaff: vi.fn(),
  syncStaffUserEmail: vi.fn(),
}))
vi.mock('@/modules/players/player.service', () => ({ getOrCreatePlayer: vi.fn() }))
vi.mock('@/shared/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/shared/observability', () => ({
  track: { auth: vi.fn() },
  withSpan: (_name: string, _op: string, fn: () => Promise<unknown>) => fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { GET } from '@/app/api/auth/callback/route'

const mockCreateClient = vi.mocked(createClient)

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/auth/callback')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

function verifyOtpError(code: string | undefined) {
  mockCreateClient.mockResolvedValue({
    auth: {
      verifyOtp: vi.fn().mockResolvedValue({ data: { user: null }, error: { code, message: 'boom' } }),
    },
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/auth/callback — error.code de verifyOtp', () => {
  it("otp_expired -> redirige a /verify con error=expired (no exchange_failed)", async () => {
    verifyOtpError('otp_expired')

    const res = await GET(makeRequest({ token_hash: 'tok-123', type: 'magiclink' }))

    const location = res.headers.get('location')
    expect(location).toContain('/verify')
    expect(new URL(location!).searchParams.get('error')).toBe('expired')
  })

  it('otro código de error -> sigue cayendo en exchange_failed (fallback genérico)', async () => {
    verifyOtpError('unexpected_failure')

    const res = await GET(makeRequest({ token_hash: 'tok-123', type: 'magiclink' }))

    const location = res.headers.get('location')
    expect(new URL(location!).searchParams.get('error')).toBe('exchange_failed')
  })

  it('sin code en el error -> exchange_failed (no explota leyendo error.code)', async () => {
    verifyOtpError(undefined)

    const res = await GET(makeRequest({ token_hash: 'tok-123', type: 'magiclink' }))

    const location = res.headers.get('location')
    expect(new URL(location!).searchParams.get('error')).toBe('exchange_failed')
  })
})
