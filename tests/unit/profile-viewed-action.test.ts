import { beforeEach, describe, expect, it, vi } from 'vitest'

// `profile.viewed` sale de esta Server Action (la ficha es ISR y no puede emitirlo al renderizar).
// Es medición: ninguna falla puede salir de la action. Se mockean el límite, la lectura del
// complejo y el emisor; el gate de estado (`isPublicPortalOpen`) y la IP son los reales.

const mocks = vi.hoisted(() => ({
  enforce: vi.fn(),
  getPublicTenant: vi.fn(),
  funnel: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
}))
vi.mock('@/shared/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/rate-limit')>()),
  enforce: mocks.enforce,
}))
vi.mock('@/modules/tenants/public.service', () => ({ getPublicTenant: mocks.getPublicTenant }))
vi.mock('@/shared/observability', () => ({ track: { funnel: mocks.funnel } }))

import { trackProfileViewedAction } from '@/app/(public)/[slug]/(perfil)/actions'

const tenant = (overrides: Record<string, unknown> = {}) => ({
  id: 'tenant-1',
  status: 'active',
  canceledPeriodEnd: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enforce.mockResolvedValue({ ok: true })
  mocks.getPublicTenant.mockResolvedValue(tenant())
})

describe('trackProfileViewedAction', () => {
  it('caso feliz: emite profile.viewed con el tenant y si la URL traía día', async () => {
    await trackProfileViewedAction('complejo-fenix', true)
    expect(mocks.getPublicTenant).toHaveBeenCalledWith('complejo-fenix')
    expect(mocks.funnel).toHaveBeenCalledTimes(1)
    expect(mocks.funnel).toHaveBeenCalledWith('profile.viewed', {
      tenantId: 'tenant-1',
      withDate: true,
    })

    await trackProfileViewedAction('complejo-fenix', false)
    expect(mocks.funnel).toHaveBeenLastCalledWith('profile.viewed', {
      tenantId: 'tenant-1',
      withDate: false,
    })
  })

  it('el límite es por IP, con la política profileViewed', async () => {
    await trackProfileViewedAction('complejo-fenix', false)
    expect(mocks.enforce).toHaveBeenCalledWith('profileViewed', '203.0.113.7')
  })

  it('withDate que no es un booleano (el cliente puede mandar cualquier cosa) cuenta como false', async () => {
    await trackProfileViewedAction('complejo-fenix', 'si' as unknown as boolean)
    expect(mocks.funnel).toHaveBeenCalledWith('profile.viewed', {
      tenantId: 'tenant-1',
      withDate: false,
    })
  })

  it('slug inválido: no gasta límite, no lee la base y no emite', async () => {
    for (const slug of ['', 'Not A Slug!', '-fenix', 'a'.repeat(65), '../admin']) {
      await trackProfileViewedAction(slug, false)
    }
    expect(mocks.enforce).not.toHaveBeenCalled()
    expect(mocks.getPublicTenant).not.toHaveBeenCalled()
    expect(mocks.funnel).not.toHaveBeenCalled()
  })

  it('complejo inexistente: no emite', async () => {
    mocks.getPublicTenant.mockResolvedValue(null)
    await trackProfileViewedAction('no-existe', false)
    expect(mocks.funnel).not.toHaveBeenCalled()
  })

  it('complejo que el portal no abre al público (suspendido, o baja sin período pago): no emite', async () => {
    for (const closed of [
      tenant({ status: 'suspended' }),
      tenant({ status: 'blocked' }),
      tenant({ status: 'canceled', canceledPeriodEnd: null }),
    ]) {
      mocks.getPublicTenant.mockResolvedValue(closed)
      await trackProfileViewedAction('complejo-fenix', false)
    }
    expect(mocks.funnel).not.toHaveBeenCalled()
  })

  it('baja voluntaria con período pago por delante: el portal sigue abierto, emite', async () => {
    mocks.getPublicTenant.mockResolvedValue(
      tenant({ status: 'canceled', canceledPeriodEnd: new Date(Date.now() + 86_400_000) }),
    )
    await trackProfileViewedAction('complejo-fenix', false)
    expect(mocks.funnel).toHaveBeenCalledTimes(1)
  })

  it('límite superado: no lee la base y no emite', async () => {
    mocks.enforce.mockResolvedValue({ ok: false })
    await trackProfileViewedAction('complejo-fenix', false)
    expect(mocks.getPublicTenant).not.toHaveBeenCalled()
    expect(mocks.funnel).not.toHaveBeenCalled()
  })

  it('es silenciosa: si falla el límite, la lectura o el emisor, no tira', async () => {
    mocks.enforce.mockRejectedValueOnce(new Error('upstash caído'))
    await expect(trackProfileViewedAction('complejo-fenix', false)).resolves.toBeUndefined()

    mocks.getPublicTenant.mockRejectedValueOnce(new Error('db caída'))
    await expect(trackProfileViewedAction('complejo-fenix', false)).resolves.toBeUndefined()

    mocks.funnel.mockImplementationOnce(() => {
      throw new Error('sink roto')
    })
    await expect(trackProfileViewedAction('complejo-fenix', false)).resolves.toBeUndefined()
  })
})
