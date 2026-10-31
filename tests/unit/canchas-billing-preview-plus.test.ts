// F1 (revisión Plus): la confirmación de "sumar cancha" tiene que mostrar la
// cuota que realmente se debita, o sea plan + Plus por cancha facturada.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({
  requireAdminStaffAction: vi.fn(),
  requireOperatorStaff: vi.fn(),
}))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@/modules/courts/court.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/courts/court.service')>()
  return { ...actual, createCourt: vi.fn(), getCourtCountAndBilled: vi.fn() }
})
vi.mock('@/modules/billing/billing.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/billing/billing.service')>()
  return { ...actual, loadActivePlan: vi.fn(), loadSub: vi.fn(), changeBilledCourts: vi.fn() }
})

import { createCourtAction } from '@/app/(admin)/canchas/actions'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { getCourtCountAndBilled } from '@/modules/courts/court.service'
import { loadActivePlan, loadSub } from '@/modules/billing/billing.service'

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const TENANT = {
  id: 'tenant-1',
  slug: 'demo',
  openingHours: Object.fromEntries(
    WEEK.map((d) => [d, { open: '08:00', close: '22:00', closed: false }]),
  ),
  closesNextDay: false,
}

function courtFormData(): FormData {
  const fd = new FormData()
  fd.set('name', 'Cancha 6')
  fd.set('surfaceType', 'synthetic_grass')
  fd.set('format', '5')
  fd.set(
    'pricing',
    JSON.stringify({ rules: [{ days: [...WEEK], from: '08:00', to: '22:00', price: 1000000 }] }),
  )
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminStaffAction).mockResolvedValue({ ok: true, tenant: TENANT } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null)
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (tx: never) => Promise<unknown>,
  ) => cb({} as never)) as never)
  vi.mocked(loadActivePlan).mockResolvedValue({
    id: 'plan-1',
    price_first_court_cents: 3_000_000,
    price_extra_court_cents: 3_000_000,
    annual_discount_bps: 1000,
  } as never)
  vi.mocked(getCourtCountAndBilled).mockResolvedValue({
    onlineCourts: 5,
    billedCourts: 5,
    isTrialing: false,
  })
})

describe('createCourtAction — preview de la cuota al sumar una cancha', () => {
  it('con Plus facturado de $12.000: 5 -> 6 canchas muestra $210.000 -> $252.000', async () => {
    vi.mocked(loadSub).mockResolvedValue({
      plus_enabled: true,
      plus_price_per_court_cents: 1_200_000,
    } as never)

    const res = await createCourtAction(courtFormData())

    expect(res).toMatchObject({
      success: false,
      requiresBillingConfirmation: {
        currentMonthlyCents: 21_000_000,
        nextMonthlyCents: 25_200_000,
      },
    })
  })

  it('Plus a precio de lista ($15.000): suma la lista por cancha', async () => {
    vi.mocked(loadSub).mockResolvedValue({
      plus_enabled: true,
      plus_price_per_court_cents: null,
    } as never)

    const res = await createCourtAction(courtFormData())

    expect(res).toMatchObject({
      requiresBillingConfirmation: {
        currentMonthlyCents: 22_500_000,
        nextMonthlyCents: 27_000_000,
      },
    })
  })

  it('sin Plus: igual que antes ($150.000 -> $180.000)', async () => {
    vi.mocked(loadSub).mockResolvedValue({
      plus_enabled: false,
      plus_price_per_court_cents: null,
    } as never)

    const res = await createCourtAction(courtFormData())

    expect(res).toMatchObject({
      requiresBillingConfirmation: {
        currentMonthlyCents: 15_000_000,
        nextMonthlyCents: 18_000_000,
      },
    })
  })
})
