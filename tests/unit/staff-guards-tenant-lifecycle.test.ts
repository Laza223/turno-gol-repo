import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TenantRow } from '@/modules/tenants/tenant.types'

// Hallazgo R2 (ensayo general): los Server Actions no pasan por
// (admin)/layout.tsx, así que su hard-lock (blocked/churned/deleted
// → /suspended) nunca corría para ellos — un tenant moroso podía seguir
// operando invocando la action por POST directo. requireStaffWithRole (usado
// por requireOperatorStaff/requireAdminStaffAction) y requireAdminStaff ahora
// chequean tenant.status. Cobertura con DB real (getStaffTenant/getStaffRole
// reales) en tests/integration/staff-guards.test.ts; acá se mockea todo el
// boundary para probar la lógica del guard en aislamiento.
//
// Decisión 2026-10-22: `suspended` es solo lectura. Las pages lo piden con
// `allowReadOnly` y pasan; las Server Actions no lo piden y rebotan con un
// mensaje propio (no el de "bloqueado").
const READ_ONLY_ERROR =
  'El complejo está en solo lectura: podés ver todo, pero no cargar ni cambiar nada hasta que se active el plan.'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/auth/impersonation.server', () => ({ getImpersonationSession: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import {
  requireAdminStaff,
  requireAdminStaffAction,
  requireOperatorStaff,
} from '@/modules/staff/guards'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const STAFF_USER_ID = '22222222-2222-4222-8222-222222222222'

function staffUser() {
  return {
    type: 'staff' as const,
    id: 'auth-1',
    email: 'admin@test.local',
    staffUserId: STAFF_USER_ID,
    tenantId: TENANT_ID,
    role: 'admin' as const,
  }
}

function tenantRow(status: TenantRow['status']): TenantRow {
  return {
    id: TENANT_ID,
    slug: 'demo-fc',
    name: 'Demo FC',
    description: null,
    logoUrl: null,
    coverUrl: null,
    address: 'Calle Falsa 123',
    city: 'CABA',
    province: 'Buenos Aires',
    phone: '1122334455',
    whatsapp: null,
    email: 'demo@turnogol.app',
    status,
    trialEndsAt: null,
    settings: {} as TenantRow['settings'],
    openingHours: {} as TenantRow['openingHours'],
    closedDates: null,
    closesNextDay: false,
    mpConnectedAt: null,
    mpNickname: null,
    latitude: null,
    longitude: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getImpersonationSession).mockResolvedValue(null)
})

describe('requireOperatorStaff — bloqueo por tenant lifecycle', () => {
  it.each(['blocked', 'churned', 'deleted'] as const)(
    'rebota con ok:false si el tenant está %s, aun pidiendo allowReadOnly',
    async (status) => {
      vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
      vi.mocked(getStaffTenant).mockResolvedValue(tenantRow(status))
      vi.mocked(getStaffRole).mockResolvedValue('admin')

      expect(await requireOperatorStaff()).toEqual({
        ok: false,
        error: 'El complejo está bloqueado por falta de pago.',
      })
      expect(await requireOperatorStaff({ allowReadOnly: true })).toEqual({
        ok: false,
        error: 'El complejo está bloqueado por falta de pago.',
      })
    },
  )

  it('suspended sin allowReadOnly (una Server Action): rebota con el mensaje de solo lectura', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('suspended'))
    vi.mocked(getStaffRole).mockResolvedValue('manager')

    const result = await requireOperatorStaff()

    expect(result).toEqual({ ok: false, error: READ_ONLY_ERROR })
  })

  it.each(['admin', 'manager'] as const)(
    'suspended con allowReadOnly (una page): el %s entra a mirar',
    async (role) => {
      vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
      vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('suspended'))
      vi.mocked(getStaffRole).mockResolvedValue(role)

      const result = await requireOperatorStaff({ allowReadOnly: true })

      expect(result.ok).toBe(true)
    },
  )

  it.each(['trialing', 'active', 'past_due', 'canceled'] as const)(
    'deja pasar si el tenant está %s',
    async (status) => {
      vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
      vi.mocked(getStaffTenant).mockResolvedValue(tenantRow(status))
      vi.mocked(getStaffRole).mockResolvedValue('manager')

      const result = await requireOperatorStaff()

      expect(result.ok).toBe(true)
    },
  )

  it('deja pasar a un tenant blocked si la sesión está impersonando (bypass SuperAdmin)', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('blocked'))
    vi.mocked(getStaffRole).mockResolvedValue('admin')
    vi.mocked(getImpersonationSession).mockResolvedValue({
      systemAdminId: 'sa-1',
      tenantId: TENANT_ID,
    })

    const result = await requireOperatorStaff()

    expect(result.ok).toBe(true)
  })

  it('deja pasar a un tenant suspended si la sesión está impersonando, sin pedir allowReadOnly', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('suspended'))
    vi.mocked(getStaffRole).mockResolvedValue('admin')
    vi.mocked(getImpersonationSession).mockResolvedValue({
      systemAdminId: 'sa-1',
      tenantId: TENANT_ID,
    })

    const result = await requireOperatorStaff()

    expect(result.ok).toBe(true)
  })

  it('el rechazo por rol tiene prioridad sobre el bloqueo por status (mensaje de rol)', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('blocked'))
    vi.mocked(getStaffRole).mockResolvedValue(null)

    const result = await requireOperatorStaff()

    expect(result).toEqual({ ok: false, error: 'Tu rol no permite realizar esta acción.' })
  })
})

describe('requireAdminStaffAction — mismo bloqueo', () => {
  it('rebota con el mensaje de solo lectura si el tenant está suspended', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('suspended'))
    vi.mocked(getStaffRole).mockResolvedValue('admin')

    const result = await requireAdminStaffAction()

    expect(result).toEqual({ ok: false, error: READ_ONLY_ERROR })
  })

  it('deja pasar suspended si la acción solo lee (allowReadOnly), p. ej. exportar datos', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('suspended'))
    vi.mocked(getStaffRole).mockResolvedValue('admin')

    const result = await requireAdminStaffAction({ allowReadOnly: true })

    expect(result.ok).toBe(true)
  })

  it('rebota con el mensaje de bloqueo si el tenant está blocked', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('blocked'))
    vi.mocked(getStaffRole).mockResolvedValue('admin')

    const result = await requireAdminStaffAction()

    expect(result).toEqual({ ok: false, error: 'El complejo está bloqueado por falta de pago.' })
  })

  it('blocked rebota aun con allowReadOnly', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('blocked'))
    vi.mocked(getStaffRole).mockResolvedValue('admin')

    const result = await requireAdminStaffAction({ allowReadOnly: true })

    expect(result).toEqual({ ok: false, error: 'El complejo está bloqueado por falta de pago.' })
  })

  it('deja pasar si el tenant está past_due (gracia de 7 días)', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('past_due'))
    vi.mocked(getStaffRole).mockResolvedValue('admin')

    const result = await requireAdminStaffAction()

    expect(result.ok).toBe(true)
  })
})

describe('requireAdminStaff — page/action guard, redirige a /suspended', () => {
  it.each(['blocked', 'churned', 'deleted'] as const)(
    'redirige a /suspended si el tenant está %s, aun pidiendo allowReadOnly',
    async (status) => {
      vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
      vi.mocked(getStaffTenant).mockResolvedValue(tenantRow(status))
      vi.mocked(getStaffRole).mockResolvedValue('admin')

      await expect(requireAdminStaff()).rejects.toThrow('REDIRECT:/suspended')
      await expect(requireAdminStaff({ allowReadOnly: true })).rejects.toThrow(
        'REDIRECT:/suspended',
      )
    },
  )

  it('suspended sin allowReadOnly (p. ej. finishOnboardingAction): redirige a /reactivar', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('suspended'))
    vi.mocked(getStaffRole).mockResolvedValue('admin')

    await expect(requireAdminStaff()).rejects.toThrow('REDIRECT:/reactivar')
  })

  it('suspended con allowReadOnly (una page de Configuración): el dueño entra a mirar', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('suspended'))
    vi.mocked(getStaffRole).mockResolvedValue('admin')

    const result = await requireAdminStaff({ allowReadOnly: true })

    expect(result.tenant.status).toBe('suspended')
  })

  it('deja pasar a un admin de un tenant active', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('active'))
    vi.mocked(getStaffRole).mockResolvedValue('admin')

    const result = await requireAdminStaff()

    expect(result.tenant.status).toBe('active')
  })

  it('deja pasar si el tenant está canceled (acceso pagado hasta period_end)', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('canceled'))
    vi.mocked(getStaffRole).mockResolvedValue('admin')

    const result = await requireAdminStaff()

    expect(result.tenant.status).toBe('canceled')
  })

  it('bypassea el bloqueo si la sesión está impersonando', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('churned'))
    vi.mocked(getStaffRole).mockResolvedValue('admin')
    vi.mocked(getImpersonationSession).mockResolvedValue({
      systemAdminId: 'sa-1',
      tenantId: TENANT_ID,
    })

    const result = await requireAdminStaff()

    expect(result.tenant.status).toBe('churned')
  })
})
