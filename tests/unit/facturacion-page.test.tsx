// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// ENS-25: la sección de baja voluntaria (CancelSubscriptionSection) se cablea
// en /settings/facturacion, visible solo en estados cancelables — sin romper
// el "Sin plan elegido" de trialing (restaurado, no tocar).

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}))
// B10 — la page pasó de `extractAuthUser` + `getStaffTenant` a mano al guard
// `requireAdminStaff()`, que además lee el rol contra `tenant_staff_members`.
// Se mockea el guard y no las dos funciones de abajo: es lo que la page llama.
vi.mock('@/modules/staff/guards', () => ({ requireAdminStaff: vi.fn() }))
// listCourts (llamada desde FacturacionPage para defaultCourts) hace
// tx.select().from(courts).where(...).orderBy(...) — el tx fake tiene que
// implementar esa cadena, no un objeto vacío.
function fakeTx() {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => []),
        })),
      })),
    })),
  }
}

vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(async (_id: string, cb: (tx: unknown) => unknown) => cb(fakeTx())),
}))
// La página monta MpPayerEmailSection (migr. 078), un client component con
// useActionState/useFormStatus — ambos undefined en vitest si no se mockean
// (mismo patrón que horarios-forms.test.tsx). React 19: useActionState vive en
// 'react'; useFormStatus siguió en 'react-dom'.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useActionState: (_action: unknown, initial: unknown) => [initial, vi.fn(), false],
  }
})
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
  }
})

vi.mock('@/modules/billing/billing.service', () => ({
  getSubscriptionState: vi.fn(),
  // Migr. 078: la página lee con qué cuenta de MercadoPago se paga.
  getBillingPayerEmail: vi.fn(async () => ({
    effective: 'a@b.com',
    override: null,
    ownerEmail: 'a@b.com',
  })),
  listActivePlans: vi.fn(async () => []),
}))

import FacturacionPage from '@/app/(admin)/settings/facturacion/page'
import { requireAdminStaff } from '@/modules/staff/guards'
import { getSubscriptionState } from '@/modules/billing/billing.service'

const STAFF_USER = {
  type: 'staff',
  staffUserId: 'staff-1',
  tenantId: 't-1',
  id: 'auth-1',
  email: 'a@b.com',
}

function tenant() {
  return { id: 't-1', mpConnectedAt: null }
}

function sub(status: string) {
  return {
    tenantId: 't-1',
    status,
    planId: 'plan-1',
    planSlug: 'predio',
    planName: 'Predio',
    billingCycle: 'monthly' as const,
    currentPeriodStart: new Date('2026-08-13T12:00:00.000Z'),
    currentPeriodEnd: new Date('2026-09-13T12:00:00.000Z'),
    mpSubscriptionId: 'mp-1',
    pendingPlanChange: null,
    pendingChangeAt: null,
    canceledAt: null,
    cancellationReason: null,
    scheduledDeletionAt: null,
    dunningStartedAt: null,
    lastPaymentFailedAt: null,
    lastPaymentAt: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminStaff).mockResolvedValue({
    user: STAFF_USER,
    tenant: tenant(),
  } as never)
})

describe('/settings/facturacion — CancelSubscriptionSection por estado', () => {
  it('trialing: mantiene "Sin plan elegido" y NO muestra el botón de cancelar', async () => {
    vi.mocked(getSubscriptionState).mockResolvedValue(sub('trialing') as never)

    render(await FacturacionPage())

    expect(screen.getByText('Sin plan elegido')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancelar suscripción' })).toBeNull()
  })

  it('active: muestra el nombre del plan y el botón de cancelar suscripción', async () => {
    vi.mocked(getSubscriptionState).mockResolvedValue(sub('active') as never)

    render(await FacturacionPage())

    expect(screen.getByText('Predio')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancelar suscripción' })).toBeTruthy()
  })

  it('canceled: muestra el texto de baja + link a /reactivar, sin el botón', async () => {
    vi.mocked(getSubscriptionState).mockResolvedValue(sub('canceled') as never)

    render(await FacturacionPage())

    expect(screen.getByText(/Suscripción cancelada — acceso hasta el/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancelar suscripción' })).toBeNull()
  })

  it('sin suscripción (sub null): no rompe, no muestra la sección de cancelar', async () => {
    vi.mocked(getSubscriptionState).mockRejectedValue(new Error('not found'))

    render(await FacturacionPage())

    expect(screen.getByText(/Todavía no tenés una suscripción activa/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancelar suscripción' })).toBeNull()
  })
})
