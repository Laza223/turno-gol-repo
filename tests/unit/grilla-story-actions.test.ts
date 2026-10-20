import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/modules/staff/guards', () => ({ requireOperatorStaff: vi.fn() }))
vi.mock('@/modules/auth/impersonation.server', () => ({ getImpersonationSession: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/observability/breadcrumbs', () => ({ track: { story: vi.fn() } }))

import { trackStoryExportAction } from '@/app/(admin)/grilla/actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { track } from '@/shared/observability/breadcrumbs'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOperatorStaff).mockResolvedValue({
    ok: true,
    tenant: { id: TENANT_ID },
  } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
  vi.mocked(getImpersonationSession).mockResolvedValue(null)
})

describe('trackStoryExportAction', () => {
  it.each(['share', 'download', 'link'] as const)(
    'registra el método %s con el tenant de la sesión',
    async (method) => {
      const res = await trackStoryExportAction({ method, daysAhead: 2 })
      expect(res).toEqual({ success: true })
      expect(track.story).toHaveBeenCalledWith('story.exported', {
        tenantId: TENANT_ID,
        method,
        daysAhead: 2,
      })
    },
  )

  it('ignora un tenantId que venga en el input: manda el de la sesión', async () => {
    await trackStoryExportAction({
      method: 'share',
      daysAhead: 0,
      tenantId: '22222222-2222-4222-8222-222222222222',
    })
    expect(track.story).toHaveBeenCalledWith('story.exported', {
      tenantId: TENANT_ID,
      method: 'share',
      daysAhead: 0,
    })
  })

  it.each([
    null,
    {},
    { method: 'email', daysAhead: 0 },
    { method: 'share', daysAhead: -1 },
    { method: 'share', daysAhead: 32 },
    { method: 'share', daysAhead: 1.5 },
    { method: 'share', daysAhead: '1' },
  ])('rechaza un input inválido: %j', async (input) => {
    const res = await trackStoryExportAction(input)
    expect(res).toEqual({ success: false, error: 'Datos inválidos.' })
    expect(requireOperatorStaff).not.toHaveBeenCalled()
    expect(track.story).not.toHaveBeenCalled()
  })

  it('devuelve el error del guard y no mide nada', async () => {
    vi.mocked(requireOperatorStaff).mockResolvedValue({ ok: false, error: 'Sin sesión.' } as never)
    const res = await trackStoryExportAction({ method: 'share', daysAhead: 0 })
    expect(res).toEqual({ success: false, error: 'Sin sesión.' })
    expect(track.story).not.toHaveBeenCalled()
  })

  it('corta por rate limit sin medir', async () => {
    vi.mocked(adminRateLimited).mockResolvedValue('Demasiados pedidos.' as never)
    const res = await trackStoryExportAction({ method: 'download', daysAhead: 0 })
    expect(res).toEqual({ success: false, error: 'Demasiados pedidos.' })
    expect(track.story).not.toHaveBeenCalled()
  })

  it('bajo impersonación de un superadmin responde ok pero no mide', async () => {
    vi.mocked(getImpersonationSession).mockResolvedValue({ systemAdminId: 'sa-1' } as never)
    const res = await trackStoryExportAction({ method: 'share', daysAhead: 0 })
    expect(res).toEqual({ success: true })
    expect(track.story).not.toHaveBeenCalled()
  })
})
