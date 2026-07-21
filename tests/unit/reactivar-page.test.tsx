// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// ENS-20: /reactivar es el destino del recovery por UI del ciclo de dunning.
// Cubre las 5 ramas del contrato: sin sesión → /login; active/trialing →
// /dashboard; rol no-admin → mensaje sin botón; estado elegible → botón de
// reactivar (endpoint /api/billing/reactivate); deadline vencido → fallback
// de soporte sin botón.

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
  // Fix 2 (R2-4 residual): CancelSubscriptionSection ahora se renderiza acá
  // también (misma necesidad que facturacion-page.test.tsx) — usa useRouter
  // para refrescar tras cancelar.
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))
// listCourts (llamada desde ReactivarPage para defaultCourts) hace
// tx.select().from(courts).where(...).orderBy(...) — el tx fake tiene que
// implementar esa cadena, no un objeto vacío.
function fakeTenantTx() {
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
  withTenantContext: vi.fn(async (_id: string, cb: (tx: unknown) => unknown) => cb(fakeTenantTx())),
  getDb: vi.fn(),
}))
vi.mock('@/modules/billing/billing.service', () => ({
  getSubscriptionState: vi.fn(),
}))

import ReactivarPage from '@/app/(public)/reactivar/page'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { getDb } from '@/shared/db/client'
import { getSubscriptionState } from '@/modules/billing/billing.service'

const STAFF_USER = { type: 'staff', staffUserId: 'staff-1', tenantId: 't-1', id: 'auth-1', email: 'a@b.com' }
const PLANS = [
  { id: 'plan-predio', slug: 'predio', name: 'Predio', maxCourts: 2, priceMonthly: 5_500_000, priceAnnual: 4_400_000 },
]

function tenant(status: string) {
  return { id: 't-1', status, settings: {}, mpConnectedAt: null }
}

function sub(status: string, scheduledDeletionAt: Date | null = null) {
  return {
    tenantId: 't-1',
    status,
    planId: 'plan-predio',
    planSlug: 'predio',
    planName: 'Predio',
    billingCycle: 'monthly' as const,
    currentPeriodStart: new Date('2027-01-01'),
    currentPeriodEnd: new Date('2027-02-01'),
    mpSubscriptionId: 'mp-1',
    pendingPlanChange: null,
    pendingChangeAt: null,
    canceledAt: null,
    cancellationReason: null,
    scheduledDeletionAt,
    dunningStartedAt: null,
    lastPaymentFailedAt: null,
    lastPaymentAt: null,
  }
}

function makeDbMock(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows)
  const where = vi.fn().mockReturnValue({ orderBy })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })
  return { select } as unknown as ReturnType<typeof getDb>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(STAFF_USER as never)
  vi.mocked(getStaffRole).mockResolvedValue('admin')
  vi.mocked(getDb).mockReturnValue(makeDbMock(PLANS))
})

describe('/reactivar — guards de sesión y estado', () => {
  it('sin sesión staff → redirect a /login', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(null)
    await expect(ReactivarPage()).rejects.toThrow('REDIRECT:/login')
  })

  it('sin tenant → redirect a /login', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(null)
    await expect(ReactivarPage()).rejects.toThrow('REDIRECT:/login')
  })

  it('tenant active → redirect a /dashboard (nada que reactivar)', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(tenant('active') as never)
    await expect(ReactivarPage()).rejects.toThrow('REDIRECT:/dashboard')
  })

  it('tenant trialing → redirect a /dashboard', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(tenant('trialing') as never)
    await expect(ReactivarPage()).rejects.toThrow('REDIRECT:/dashboard')
  })
})

describe('/reactivar — rol no-admin', () => {
  it('manager ve el mensaje "pedile al dueño", sin botón de reactivar', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(tenant('suspended') as never)
    vi.mocked(getStaffRole).mockResolvedValue('manager')
    vi.mocked(getSubscriptionState).mockResolvedValue(sub('suspended') as never)

    render(await ReactivarPage())

    expect(screen.getByText(/Pedile al dueño del complejo/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reactivar plan' })).toBeNull()
  })
})

describe('/reactivar — admin en estado elegible', () => {
  it('suspended: muestra el botón de reactivar apuntando a /api/billing/reactivate', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(tenant('suspended') as never)
    vi.mocked(getSubscriptionState).mockResolvedValue(sub('suspended') as never)

    render(await ReactivarPage())

    expect(screen.getByText('Tu cuenta está suspendida')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reactivar plan' })).toBeTruthy()
  })

  it('blocked: muestra el botón de reactivar', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(tenant('blocked') as never)
    vi.mocked(getSubscriptionState).mockResolvedValue(sub('blocked') as never)

    render(await ReactivarPage())

    expect(screen.getByText('Tu cuenta está bloqueada')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reactivar plan' })).toBeTruthy()
  })

  it('churned con deadline futuro: muestra la fecha límite y el botón', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(tenant('churned') as never)
    const future = new Date(Date.now() + 5 * 86_400_000)
    vi.mocked(getSubscriptionState).mockResolvedValue(sub('churned', future) as never)

    render(await ReactivarPage())

    expect(screen.getByText(/Tenés hasta el/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reactivar plan' })).toBeTruthy()
  })

  it('churned con deadline vencido: NO muestra el botón, muestra fallback de soporte', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(tenant('churned') as never)
    const past = new Date(Date.now() - 86_400_000)
    vi.mocked(getSubscriptionState).mockResolvedValue(sub('churned', past) as never)

    render(await ReactivarPage())

    expect(screen.getByText(/El plazo para reactivar venció/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reactivar plan' })).toBeNull()
    expect(screen.getByText('Contactar a soporte')).toBeTruthy()
  })
})

describe('/reactivar — past_due (sigue con acceso completo al panel)', () => {
  it('no muestra botón de reactivar (evita duplicar el reintento automático de MP) y linkea a /dashboard', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(tenant('past_due') as never)
    vi.mocked(getSubscriptionState).mockResolvedValue(sub('past_due') as never)

    render(await ReactivarPage())

    expect(screen.getByText('Tu último pago falló')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reactivar plan' })).toBeNull()
    expect(screen.getByText('Volver al panel')).toBeTruthy()
  })
})

// Fix 2 (R2-4 residual): el hard-lock del layout de (admin) saca a TODO
// `suspended` fuera de `/settings/facturacion` (donde vive el botón de baja
// normal, ENS-25) — sin esto, un dueño suspendido no tenía NINGÚN camino de
// UI a la baja voluntaria (Res. 424/2020). `/reactivar` es la única página
// que un `suspended` ve, así que reutiliza `CancelSubscriptionSection`
// gateada por el mismo `CANCELABLE` que usa `/settings/facturacion`.
describe('/reactivar — sección de baja (Fix 2, R2-4 residual)', () => {
  it('suspended: ve el botón de "Cancelar suscripción" además del de reactivar', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(tenant('suspended') as never)
    vi.mocked(getSubscriptionState).mockResolvedValue(sub('suspended') as never)

    render(await ReactivarPage())

    expect(screen.getByRole('button', { name: 'Reactivar plan' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancelar suscripción' })).toBeTruthy()
  })

  it('blocked: NO ve el botón de cancelar (blocked no es una transición válida de cancel())', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(tenant('blocked') as never)
    vi.mocked(getSubscriptionState).mockResolvedValue(sub('blocked') as never)

    render(await ReactivarPage())

    expect(screen.getByRole('button', { name: 'Reactivar plan' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancelar suscripción' })).toBeNull()
  })

  it('churned (deadline futuro): NO ve el botón de cancelar (mismo motivo que blocked)', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(tenant('churned') as never)
    const future = new Date(Date.now() + 5 * 86_400_000)
    vi.mocked(getSubscriptionState).mockResolvedValue(sub('churned', future) as never)

    render(await ReactivarPage())

    expect(screen.queryByRole('button', { name: 'Cancelar suscripción' })).toBeNull()
  })

  it('past_due: ve el botón de cancelar (CANCELABLE lo incluye) junto al fallback de soporte', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(tenant('past_due') as never)
    vi.mocked(getSubscriptionState).mockResolvedValue(sub('past_due') as never)

    render(await ReactivarPage())

    expect(screen.getByText('Volver al panel')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancelar suscripción' })).toBeTruthy()
  })
})
