import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fix 4 (M7, ENS-26): `staff/actions.ts` NO pasa por requireOperatorStaff /
// requireAdminStaffAction (los guards centrales de M5) — tiene su propio
// guard local (`guardStaffMutation`, ver STAFF_WRITE_BLOCKED_STATUSES). Antes
// era una 3ra copia hardcodeada que incluía `canceled`, contradiciendo ENS-26
// (`canceled` = acceso completo hasta `current_period_end`, ya pagó). Ahora
// deriva de la misma fuente única que `guards.ts`
// (`BLOCKED_TENANT_STATUSES` + `READ_ONLY_TENANT_STATUSES` de
// tenant.lifecycle.ts) — `canceled` deja de bloquear la gestión de equipo. Mismo
// harness de mocks que staff-invite-existing-user.test.ts (mockea toda la
// tx/worker DB para poder recorrer el happy path completo, no solo el guard).

const h = vi.hoisted(() => {
  const txLimit = vi.fn(async () => [] as unknown[])
  const actorLimit = vi.fn(async () => [{ role: 'admin' }] as unknown[])
  const tsmInsert = vi.fn()
  const tx = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => ({ limit: txLimit }) }),
        where: () => ({ limit: actorLimit }),
      }),
    }),
    insert: tsmInsert,
  }
  const staffUserInsert = vi.fn()
  const workerDb = { insert: staffUserInsert }
  return {
    extractAuthUser: vi.fn(),
    getStaffTenant: vi.fn(),
    adminRateLimited: vi.fn(),
    inviteUserByEmail: vi.fn(),
    updateUserById: vi.fn(),
    listUsers: vi.fn(),
    txLimit,
    actorLimit,
    tsmInsert,
    staffUserInsert,
    workerDb,
    tx,
  }
})

vi.mock('next/navigation', () => ({
  redirect: (u: string) => {
    throw new Error(`REDIRECT:${u}`)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: h.extractAuthUser }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: h.getStaffTenant }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: h.adminRateLimited }))
vi.mock('@/shared/db/client', () => ({
  withTenantContext: (_t: string, fn: (tx: unknown) => unknown) => fn(h.tx),
  getWorkerDb: () => h.workerDb,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        inviteUserByEmail: h.inviteUserByEmail,
        updateUserById: h.updateUserById,
        listUsers: h.listUsers,
      },
    },
  }),
}))

import { inviteStaffAction } from '@/app/(admin)/settings/equipo/actions'

function makeForm(email = 'new@x.com'): FormData {
  const f = new FormData()
  f.set('email', email)
  f.set('firstName', 'Nuevo')
  f.set('lastName', 'Staff')
  return f
}

function tenant(status: string) {
  return { id: 'tenant-1', status, settings: {} }
}

const NOT_ACTIVE_ERROR = { success: false, error: 'El complejo no está activo.' }

beforeEach(() => {
  vi.resetAllMocks()
  h.extractAuthUser.mockResolvedValue({
    type: 'staff',
    staffUserId: 'inviter-1',
    id: 'u',
    email: 'a@b.com',
  })
  h.getStaffTenant.mockResolvedValue(tenant('active'))
  h.adminRateLimited.mockResolvedValue(null)
  h.txLimit.mockResolvedValue([])
  h.actorLimit.mockResolvedValue([{ role: 'admin' }])
  h.inviteUserByEmail.mockResolvedValue({ data: { user: { id: 'auth-new' } }, error: null })
  h.updateUserById.mockResolvedValue({ data: {}, error: null })
  h.staffUserInsert.mockReturnValue({
    values: () => ({
      onConflictDoUpdate: () => ({ returning: async () => [{ id: 'staff-new' }] }),
    }),
  })
  h.tsmInsert.mockReturnValue({
    values: () => ({ onConflictDoUpdate: async () => undefined }),
  })
})

describe('inviteStaffAction — canceled ya NO bloquea la gestión de equipo (ENS-26)', () => {
  it('canceled: llega al happy path completo (rate-limit + insert + invite)', async () => {
    h.getStaffTenant.mockResolvedValue(tenant('canceled'))

    const res = await inviteStaffAction(makeForm())

    expect(res).not.toEqual(NOT_ACTIVE_ERROR)
    expect(res.success).toBe(true)
    expect(h.adminRateLimited).toHaveBeenCalledWith('tenant-1')
  })

  it.each(['suspended', 'blocked', 'churned', 'deleted'])(
    '%s: sigue bloqueado (STAFF_WRITE_BLOCKED_STATUSES derivado de tenant.lifecycle.ts)',
    async (status) => {
      h.getStaffTenant.mockResolvedValue(tenant(status))

      const res = await inviteStaffAction(makeForm())

      expect(res).toEqual(NOT_ACTIVE_ERROR)
      expect(h.adminRateLimited).not.toHaveBeenCalled()
    },
  )
})

// `guardStaffMutation` es una única función compartida por las 4 actions de
// este archivo (invite/deactivate/updateRole/resendInvite) — cubrir el
// cambio de comportamiento (canceled deja de bloquear) vía inviteStaffAction
// arriba prueba la función real que gatea a las 4. deactivateStaffAction
// mismo, con mock shallow de withTenantContext, en el archivo co-localizado
// `src/app/(admin)/settings/equipo/actions.test.ts` (histórico, no corre en CI —
// `pnpm test` es `vitest run --dir tests/unit`).
