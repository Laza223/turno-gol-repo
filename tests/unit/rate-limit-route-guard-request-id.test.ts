import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hallazgo #6 (campaña de mutación, docs/qa/TEST_AUDIT.md): `guard()` llama
// `rateLimit429(r)` sin el segundo argumento `requestId`, así que
// `meta.request_id` en la respuesta 429 siempre sale `null` — aun corriendo en
// runtime nodejs, donde `getRequestContext()` SÍ tiene el id poblado (a
// diferencia de `apply.ts`, que debe quedar edge-safe para middleware.ts).

vi.mock('@/shared/rate-limit/apply', () => ({
  enforce: vi.fn(),
  rateLimit429: vi.fn(() => new Response('{}', { status: 429 })),
}))
vi.mock('@/shared/lib/request-context', () => ({
  getRequestContext: vi.fn(),
}))

import { guard } from '@/shared/rate-limit/route-guard'
import { enforce, rateLimit429 } from '@/shared/rate-limit/apply'
import { getRequestContext } from '@/shared/lib/request-context'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('guard() — propaga el request_id real a la respuesta 429', () => {
  it('con contexto de request poblado, pasa requestId a rateLimit429', async () => {
    vi.mocked(enforce).mockResolvedValue({
      ok: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 5000,
      unavailable: false,
    })
    vi.mocked(getRequestContext).mockReturnValue({ requestId: 'req-abc-123' })

    await guard('adminCrud', 'tenant-1')

    expect(rateLimit429).toHaveBeenCalledWith(expect.anything(), 'req-abc-123')
  })

  it('permitido (ok=true) → no llama rateLimit429, no bloquea', async () => {
    vi.mocked(enforce).mockResolvedValue({
      ok: true,
      limit: 10,
      remaining: 9,
      reset: 0,
      unavailable: false,
    })
    const result = await guard('adminCrud', 'tenant-1')
    expect(result).toBeNull()
    expect(rateLimit429).not.toHaveBeenCalled()
  })
})
