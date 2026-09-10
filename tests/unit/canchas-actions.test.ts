// Rastro en Sentry cuando el sistema bloquea a un complejo (Parte 2 del lote):
// un complejo real quedó trabado sin poder cargar canchas y el sistema no
// dejó NINGUNA señal — las Server Actions devuelven { success: false, error }
// y ahí muere, sin excepción que Sentry pueda ver. Este archivo verifica que
// las dos ramas de rechazo de negocio (cobertura de precios incompleta y
// techo de plan) ahora sí avisan, con nivel `warning` (regla de negocio
// funcionando, no una excepción) y el dato que explica el bloqueo.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({
  requireAdminStaffAction: vi.fn(),
  requireOperatorStaff: vi.fn(),
}))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

// validatePricingRulesCoverage queda REAL (importOriginal): estos tests
// ejercitan la regla de negocio de verdad, no un mock que la de por buena.
vi.mock('@/modules/courts/court.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/courts/court.service')>()
  return {
    ...actual,
    createCourt: vi.fn(),
    updateCourt: vi.fn(),
    toggleStatus: vi.fn(),
    getCourtCountAndLimit: vi.fn(),
    getCourtById: vi.fn(),
    appendCourtPhoto: vi.fn(),
    removeCourtPhoto: vi.fn(),
    reorderCourtPhotos: vi.fn(),
  }
})

import { createCourtAction, updateCourtAction } from '@/app/(admin)/canchas/actions'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { createCourt, updateCourt, getCourtCountAndLimit } from '@/modules/courts/court.service'
import { captureMessage } from '@/lib/sentry'

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const TENANT = {
  id: 'tenant-1',
  slug: 'demo',
  openingHours: Object.fromEntries(
    WEEK.map((d) => [d, { open: '08:00', close: '22:00', closed: false }]),
  ),
  closesNextDay: false,
}
const FAKE_TX = {} as never

function courtFormData(pricingRules: unknown[]): FormData {
  const fd = new FormData()
  fd.set('name', 'Cancha 1')
  fd.set('surfaceType', 'synthetic_grass')
  fd.set('format', '5')
  fd.set('pricing', JSON.stringify({ rules: pricingRules }))
  return fd
}

const FULL_WEEK_RULE = [{ days: [...WEEK], from: '08:00', to: '22:00', price: 1000000 }]
// Sólo lunes tiene precio: martes a domingo quedan sin cubrir.
const GAP_RULE = [{ days: ['mon'], from: '08:00', to: '22:00', price: 1000000 }]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminStaffAction).mockResolvedValue({ ok: true, tenant: TENANT } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null)
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (tx: never) => Promise<unknown>,
  ) => cb(FAKE_TX)) as never)
})

describe('createCourtAction — señal en Sentry al bloquear', () => {
  it('cobertura de precios incompleta: rechaza y avisa (warning) con el tenant y el hueco', async () => {
    const res = await createCourtAction(courtFormData(GAP_RULE))

    expect(res.success).toBe(false)
    expect(vi.mocked(createCourt)).not.toHaveBeenCalled()
    expect(vi.mocked(captureMessage)).toHaveBeenCalledWith(
      'crear cancha: cobertura de precios incompleta',
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({ tenantId: 'tenant-1', gapsCount: expect.any(Number) }),
      }),
    )
  })

  it('techo de plan alcanzado: rechaza y avisa (warning) con el conteo y el techo', async () => {
    vi.mocked(getCourtCountAndLimit).mockResolvedValue({
      count: 3,
      maxCourts: 3,
      planSlug: 'predio',
    })

    const res = await createCourtAction(courtFormData(FULL_WEEK_RULE))

    expect(res.success).toBe(false)
    expect(vi.mocked(createCourt)).not.toHaveBeenCalled()
    expect(vi.mocked(captureMessage)).toHaveBeenCalledWith(
      'crear cancha: techo de plan alcanzado',
      expect.objectContaining({
        level: 'warning',
        extra: { tenantId: 'tenant-1', count: 3, maxCourts: 3 },
      }),
    )
  })

  it('sin huecos y sin techo: crea la cancha y no deja ninguna señal en Sentry', async () => {
    vi.mocked(getCourtCountAndLimit).mockResolvedValue({
      count: 0,
      maxCourts: null,
      planSlug: null,
    })
    vi.mocked(createCourt).mockResolvedValue({ id: 'court-1' } as never)

    const res = await createCourtAction(courtFormData(FULL_WEEK_RULE))

    expect(res.success).toBe(true)
    expect(vi.mocked(captureMessage)).not.toHaveBeenCalled()
  })
})

describe('updateCourtAction — señal en Sentry al bloquear', () => {
  it('cobertura de precios incompleta: rechaza y avisa (warning) con el tenant, la cancha y el hueco', async () => {
    const res = await updateCourtAction('court-1', courtFormData(GAP_RULE))

    expect(res.success).toBe(false)
    expect(vi.mocked(updateCourt)).not.toHaveBeenCalled()
    expect(vi.mocked(captureMessage)).toHaveBeenCalledWith(
      'editar cancha: cobertura de precios incompleta',
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({ tenantId: 'tenant-1', courtId: 'court-1' }),
      }),
    )
  })

  it('sin huecos: guarda y no deja ninguna señal en Sentry', async () => {
    vi.mocked(updateCourt).mockResolvedValue({ id: 'court-1' } as never)

    const res = await updateCourtAction('court-1', courtFormData(FULL_WEEK_RULE))

    expect(res.success).toBe(true)
    expect(vi.mocked(captureMessage)).not.toHaveBeenCalled()
  })
})
