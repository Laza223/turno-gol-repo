import { afterEach, describe, expect, it, vi } from 'vitest'

// Red de seguridad de /super-admin: si `getDashboardData` no vuelve, la página
// tiene que fallar (cae al error.tsx del panel, dentro del shell) en vez de
// dejar el spinner del navegador hasta el timeout de 300 s de Vercel.

const h = vi.hoisted(() => ({ getDashboardData: vi.fn() }))

vi.mock('@/modules/super-admin/dashboard.service', () => ({
  getDashboardData: h.getDashboardData,
}))

afterEach(() => {
  vi.useRealTimers()
})

describe('SuperAdminDashboardPage — tope de tiempo', () => {
  it('rechaza con un error legible cuando el dashboard no vuelve', async () => {
    vi.useFakeTimers()
    h.getDashboardData.mockReturnValue(new Promise<never>(() => {}))
    const { default: SuperAdminDashboardPage } =
      await import('@/app/(super-admin)/super-admin/page')

    const render = SuperAdminDashboardPage()
    const rejected = expect(render).rejects.toThrow('El dashboard tardó demasiado en cargar.')
    await vi.advanceTimersByTimeAsync(15_100)

    await rejected
  })
})
