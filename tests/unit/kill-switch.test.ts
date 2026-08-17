import { afterEach, describe, expect, it, vi } from 'vitest'
import { redirect } from 'next/navigation'
import { isFeatureEnabled, preloadFeatureFlags } from '@/shared/feature-flags'
import { redirectIfTenantSuspended, TENANT_SUSPENDED_FLAG } from '@/shared/kill-switch'

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/shared/feature-flags', () => ({
  isFeatureEnabled: vi.fn(),
  // Resuelve por defecto: el kill switch encadena un `.catch()` sobre lo que
  // devuelve, así que un `vi.fn()` pelado (undefined) explotaría por el mock y
  // no por el código. `clearAllMocks` limpia las llamadas, no la implementación.
  preloadFeatureFlags: vi.fn().mockResolvedValue(undefined),
}))

const mockRedirect = vi.mocked(redirect)
const mockIsFeatureEnabled = vi.mocked(isFeatureEnabled)
const mockPreload = vi.mocked(preloadFeatureFlags)

afterEach(() => {
  vi.clearAllMocks()
})

describe('redirectIfTenantSuspended (kill switch)', () => {
  it('redirects to /suspended when the tenant carries the suspended flag', async () => {
    mockIsFeatureEnabled.mockResolvedValue(true)

    await redirectIfTenantSuspended('tenant-1')

    expect(mockIsFeatureEnabled).toHaveBeenCalledWith(TENANT_SUSPENDED_FLAG, 'tenant-1')
    expect(mockRedirect).toHaveBeenCalledWith('/suspended')
  })

  it('does not redirect when the tenant is not suspended', async () => {
    mockIsFeatureEnabled.mockResolvedValue(false)

    await redirectIfTenantSuspended('tenant-1')

    expect(mockIsFeatureEnabled).toHaveBeenCalledWith(TENANT_SUSPENDED_FLAG, 'tenant-1')
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('precarga en la MISMA pasada los flags extra que le pide el caller', async () => {
    mockIsFeatureEnabled.mockResolvedValue(false)

    await redirectIfTenantSuspended('tenant-1', ['tournaments'])

    // Un solo preload con las dos claves = una sola transacción, en vez de una
    // por flag. Es lo que hace el layout de (admin) con `tournaments`.
    expect(mockPreload).toHaveBeenCalledTimes(1)
    expect(mockPreload).toHaveBeenCalledWith([TENANT_SUSPENDED_FLAG, 'tournaments'], 'tenant-1')
  })

  it('si el preload falla, igual resuelve el flag y no rompe el layout', async () => {
    mockPreload.mockRejectedValueOnce(new Error('db down'))
    mockIsFeatureEnabled.mockResolvedValue(true)

    await redirectIfTenantSuspended('tenant-1')

    // El preload es una optimización: que se caiga no puede cambiar la decisión
    // del kill switch, que se sigue leyendo por el camino de siempre.
    expect(mockRedirect).toHaveBeenCalledWith('/suspended')
  })
})
