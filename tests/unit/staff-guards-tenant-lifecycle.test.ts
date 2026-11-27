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
    mpDisconnectedAt: null,
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

// Fin del freemium (2026-11-27): `trial_expired` (y su alias `free`) ve el panel como solo
// lectura y solo opera donde la función pide `allowExpired`. Dueño y encargado pasan igual;
// la impersonación pasa siempre.
describe.each(['trial_expired', 'free'] as const)('plan no activo (%s)', (status) => {
  const EXPIRED_ERROR =
    'Tu plan no está activo. Podés ver todo y operar los turnos que ya estaban confirmados. Activá el plan para cargar o cambiar algo más.'

  it('sin allowExpired ni allowReadOnly (una escritura): rebota con reason plan', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow(status))
    vi.mocked(getStaffRole).mockResolvedValue('admin')

    expect(await requireOperatorStaff()).toEqual({
      ok: false,
      error: EXPIRED_ERROR,
      reason: 'plan',
    })
    expect(await requireAdminStaffAction()).toEqual({
      ok: false,
      error: EXPIRED_ERROR,
      reason: 'plan',
    })
  })

  it('con allowExpired (operar una reserva que ya existe): pasa el dueño y el encargado', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow(status))

    vi.mocked(getStaffRole).mockResolvedValue('admin')
    expect((await requireOperatorStaff({ allowExpired: true })).ok).toBe(true)
    vi.mocked(getStaffRole).mockResolvedValue('manager')
    expect((await requireOperatorStaff({ allowExpired: true })).ok).toBe(true)
  })

  it('con allowReadOnly (lectura) también pasa', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow(status))
    vi.mocked(getStaffRole).mockResolvedValue('admin')

    expect((await requireOperatorStaff({ allowReadOnly: true })).ok).toBe(true)
  })

  it('allowExpired NO abre un complejo en solo lectura por mora (suspended)', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow('suspended'))
    vi.mocked(getStaffRole).mockResolvedValue('admin')

    expect((await requireOperatorStaff({ allowExpired: true })).ok).toBe(false)
  })

  it('el rol sigue mandando: un rol no permitido rebota aun con allowExpired', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow(status))
    vi.mocked(getStaffRole).mockResolvedValue('manager')

    expect((await requireAdminStaffAction({ allowExpired: true })).ok).toBe(false)
  })

  it('impersonando, el super admin pasa sin opt-in', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow(status))
    vi.mocked(getStaffRole).mockResolvedValue('admin')
    vi.mocked(getImpersonationSession).mockResolvedValue({
      systemAdminId: 'sa-1',
      tenantId: TENANT_ID,
    })

    expect((await requireOperatorStaff()).ok).toBe(true)
  })

  it('requireAdminStaff (page): una escritura sin opt-in redirige a /reactivar; en lectura entra', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(staffUser())
    vi.mocked(getStaffTenant).mockResolvedValue(tenantRow(status))
    vi.mocked(getStaffRole).mockResolvedValue('admin')

    await expect(requireAdminStaff()).rejects.toThrow('REDIRECT:/reactivar')
    const result = await requireAdminStaff({ allowReadOnly: true })
    expect(result.tenant.status).toBe(status)
  })
})
