// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// ENS-26: un tenant `canceled` conserva acceso completo al panel — solo el
// sweep `canceled → blocked` (cuando vence `period_end`) corta el acceso, y
// `blocked` sigue en el hard-lock. Cubre las 5 ramas: acceso normal para
// `canceled`, y redirect a /suspended para blocked/churned/suspended/deleted.

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/auth/impersonation.server', () => ({ resolveImpersonatedStaffContext: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))
vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(async () => ({ currentPeriodEnd: new Date('2026-09-13T12:00:00.000Z') })),
}))
vi.mock('@/shared/kill-switch', () => ({ redirectIfTenantSuspended: vi.fn(async () => undefined) }))
vi.mock('@/shared/db/schema', () => ({ tenantSubscriptions: {} }))
vi.mock('@/components/layout/admin-layout-shell', () => ({
  AdminLayoutShell: ({ tenantStatus, children }: { tenantStatus: string; children: React.ReactNode }) => (
    <div data-testid="admin-shell" data-tenant-status={tenantStatus}>
      {children}
    </div>
  ),
}))
vi.mock('@/components/layout/impersonation-banner', () => ({ ImpersonationBanner: () => null }))
vi.mock('@/components/admin/PushNotificationManagerLoader', () => ({
  PushNotificationManagerLoader: () => null,
}))
vi.mock('@/app/(admin)/actions/auth', () => ({ signOutAction: vi.fn() }))
vi.mock('@/app/(super-admin)/super-admin/tenants/[id]/actions', () => ({ stopImpersonationAction: vi.fn() }))

import AdminLayout from '@/app/(admin)/layout'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { resolveImpersonatedStaffContext } from '@/modules/auth/impersonation.server'
import { getStaffTenant } from '@/modules/tenants/tenant.service'

const STAFF_USER = {
  type: 'staff',
  staffUserId: 'staff-1',
  tenantId: 't-1',
  id: 'auth-1',
  email: 'a@b.com',
  forcePasswordChange: false,
}

function tenant(status: string) {
  return {
    id: 't-1',
    name: 'Complejo Demo',
    status,
    trialEndsAt: null,
    settings: { onboarding_completed: true },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(STAFF_USER as never)
  vi.mocked(resolveImpersonatedStaffContext).mockResolvedValue(null)
})

describe('AdminLayout — hard lock por tenant_status', () => {
  it('canceled: NO redirige — entra al panel con acceso completo (ENS-26)', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(tenant('canceled') as never)

    render(await AdminLayout({ children: <p>contenido</p> }))

    const shell = screen.getByTestId('admin-shell')
    expect(shell.getAttribute('data-tenant-status')).toBe('canceled')
    expect(screen.getByText('contenido')).toBeTruthy()
  })

  it.each(['blocked', 'churned', 'suspended', 'deleted'])(
    '%s: redirige a /suspended',
    async (status) => {
      vi.mocked(getStaffTenant).mockResolvedValue(tenant(status) as never)
      await expect(AdminLayout({ children: <p>contenido</p> })).rejects.toThrow('REDIRECT:/suspended')
    },
  )

  it('active: NO redirige (caso base, regresión)', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(tenant('active') as never)

    render(await AdminLayout({ children: <p>contenido</p> }))

    expect(screen.getByTestId('admin-shell').getAttribute('data-tenant-status')).toBe('active')
  })
})
