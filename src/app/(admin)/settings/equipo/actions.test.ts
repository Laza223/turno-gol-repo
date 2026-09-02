import { beforeEach, describe, expect, it, vi } from 'vitest'

// Guards de mutacion de staff (Fase 3 #12/#14). Mockeamos toda la
// infraestructura (auth, tenant, rate-limit, DB, Supabase admin) para
// testear la logica de autorizacion sin DB.
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(),
}))
vi.mock('@/modules/tenants/tenant.service', () => ({
  getStaffTenant: vi.fn(),
}))
vi.mock('@/shared/rate-limit/server-action', () => ({
  adminRateLimited: vi.fn(),
}))
vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))
// staff.service corre sobre el pool WORKER (bypass RLS): sin este mock,
// resendInviteAction pega a la DB de verdad en un test unitario.
vi.mock('@/modules/staff/staff.service', () => ({
  isStaffMemberOfTenant: vi.fn(),
  upsertStaffUser: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import {
  deactivateStaffAction,
  inviteStaffAction,
  resendInviteAction,
} from '@/app/(admin)/settings/equipo/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { withTenantContext } from '@/shared/db/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { isStaffMemberOfTenant, upsertStaffUser } from '@/modules/staff/staff.service'

const STAFF_USER = {
  type: 'staff' as const,
  staffUserId: 'staff-1',
  tenantId: 'tenant-1',
  email: 'owner@test.local',
}

const mockTenant = (status: string) => ({ id: 'tenant-1', status, settings: {} })

const inviteUserByEmail = vi.fn()

function inviteForm() {
  const fd = new FormData()
  fd.set('email', 'nuevo@test.local')
  fd.set('firstName', 'Juan')
  fd.set('lastName', 'Perez')
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(STAFF_USER as never)
  vi.mocked(getStaffTenant).mockResolvedValue(mockTenant('active') as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null)
  inviteUserByEmail.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null })
  vi.mocked(createAdminClient).mockReturnValue({
    auth: {
      admin: { inviteUserByEmail, updateUserById: vi.fn().mockResolvedValue({}) },
    },
  } as never)
})

describe('staff actions — estado del tenant / kill-switch (#14)', () => {
  it.each(['suspended', 'blocked', 'churned', 'deleted'])(
    'inviteStaffAction rechaza tenant en estado %s',
    async (status) => {
      vi.mocked(getStaffTenant).mockResolvedValue(mockTenant(status) as never)
      const res = await inviteStaffAction(inviteForm())
      expect(res).toEqual({ success: false, error: 'El complejo no está activo.' })
      expect(adminRateLimited).not.toHaveBeenCalled()
    },
  )

  it('deactivateStaffAction rechaza tenant bloqueado', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(mockTenant('blocked') as never)
    const res = await deactivateStaffAction('member-1')
    expect(res).toEqual({ success: false, error: 'El complejo no está activo.' })
  })

  // Fix 4 (M7, ENS-26): `canceled` = acceso completo hasta `current_period_end`
  // (ya pagó) — antes `STAFF_WRITE_BLOCKED_STATUSES` lo bloqueaba igual que un
  // moroso sin pagar, contradiciendo el resto del panel. Ahora deriva de la
  // misma fuente única que `guards.ts` (`BLOCKED_TENANT_STATUSES` +
  // `READ_ONLY_TENANT_STATUSES` de tenant.lifecycle.ts), que no incluye `canceled`.
  it('deactivateStaffAction NO rechaza tenant canceled — avanza al rate-limit + DB', async () => {
    vi.mocked(getStaffTenant).mockResolvedValue(mockTenant('canceled') as never)
    vi.mocked(withTenantContext).mockResolvedValue({ success: true })
    const res = await deactivateStaffAction('member-1')
    expect(res).toEqual({ success: true })
    expect(adminRateLimited).toHaveBeenCalledWith('tenant-1')
  })
})

describe('resendInviteAction — verificacion de membership (#12)', () => {
  // `withTenantContext` acá envuelve SOLO a assertActorIsAdmin, que devuelve
  // null cuando el actor es admin (o un StaffActionResult de error si no).
  const actorIsAdmin = () => vi.mocked(withTenantContext).mockResolvedValue(null)

  it('rechaza un email que no es miembro del tenant', async () => {
    actorIsAdmin()
    vi.mocked(isStaffMemberOfTenant).mockResolvedValue(false)
    const res = await resendInviteAction('ajeno@otro.local')
    expect(res).toEqual({
      success: false,
      error: 'Este email no es miembro del complejo.',
    })
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('rechaza a un actor que no es admin, sin consultar membership', async () => {
    vi.mocked(withTenantContext).mockResolvedValue({
      success: false,
      error: 'Solo un administrador puede gestionar el equipo.',
    })
    const res = await resendInviteAction('miembro@test.local')
    expect(res).toEqual({
      success: false,
      error: 'Solo un administrador puede gestionar el equipo.',
    })
    expect(isStaffMemberOfTenant).not.toHaveBeenCalled()
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('rechaza un email con formato invalido sin tocar la DB', async () => {
    const res = await resendInviteAction('no-es-email')
    expect(res).toEqual({ success: false, error: 'Email inválido.' })
    expect(withTenantContext).not.toHaveBeenCalled()
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('reenvia a un miembro activo, normalizando el email a minuscula', async () => {
    actorIsAdmin()
    vi.mocked(isStaffMemberOfTenant).mockResolvedValue(true)
    const res = await resendInviteAction('Miembro@Test.Local')
    expect(res).toEqual({ success: true })
    expect(isStaffMemberOfTenant).toHaveBeenCalledWith('tenant-1', 'miembro@test.local')
    expect(inviteUserByEmail).toHaveBeenCalledWith('miembro@test.local', expect.any(Object))
  })
})

describe('staff actions — happy path supera los guards', () => {
  it('con tenant activo, deactivate avanza al rate-limit + DB', async () => {
    vi.mocked(withTenantContext).mockResolvedValue({ success: true })
    const res = await deactivateStaffAction('member-1')
    expect(adminRateLimited).toHaveBeenCalledWith('tenant-1')
    expect(res).toEqual({ success: true })
  })
})

// Chainable mock de `tx` para el insert/upsert de la Fase 3 (03-invite-staff-rollback).
function fakeTx() {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  }
}

describe('inviteStaffAction — rollback ante fallo real de entrega (03-invite-staff-rollback)', () => {
  it('el callback de la Fase 3 RECHAZA (throw) cuando inviteUserByEmail falla, en vez de retornar un valor de negocio que comitearía igual', async () => {
    // Fase 1 (preflight): actor admin, sin duplicado.
    vi.mocked(withTenantContext).mockResolvedValueOnce({ success: true })
    vi.mocked(upsertStaffUser).mockResolvedValue({ id: 'staffuser-1' } as never)
    inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: 'SMTP error: could not send email' },
    })

    // Fase 3: capturamos el callback real que recibe withTenantContext. El
    // pool real (`db.transaction(fn) => fn(tx)`) solo hace rollback si ese
    // callback LANZA — antes del fix devolvía {success:false, error} como
    // valor normal, y el upsert de tenant_staff_members comiteaba igual.
    let phase3Callback: ((tx: unknown) => Promise<unknown>) | undefined
    vi.mocked(withTenantContext).mockImplementationOnce((_id, fn) => {
      phase3Callback = fn as (tx: unknown) => Promise<unknown>
      return fn(fakeTx() as never)
    })

    const res = await inviteStaffAction(inviteForm())

    expect(phase3Callback).toBeDefined()
    await expect(phase3Callback!(fakeTx())).rejects.toThrow('SMTP error: could not send email')

    // El Server Action sigue devolviendo el mismo StaffActionResult de error
    // al usuario -- lo que cambió es que ahora la tx real hace rollback.
    expect(res).toEqual({
      success: false,
      error:
        'No pudimos enviar la invitación por email. Verificá que el email esté bien escrito y probá de nuevo en unos minutos.',
    })
  })
})
