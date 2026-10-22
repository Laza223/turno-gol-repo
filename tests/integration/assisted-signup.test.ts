import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSql } from '@/shared/db/client'
import { REFERRAL_PROMO_ENDS_AT, TRIAL_DAYS } from '@/shared/constants'
import { adminSql } from '../helpers/admin-db'
import {
  asApp,
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestSystemAdmin,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'

// La base queda real; se mockea solo el borde externo (Supabase Auth) y Sentry,
// para poder afirmar qué viaja a cada uno.
const createUser = vi.fn()
const deleteUser = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { createUser, deleteUser } } }),
}))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

// El alta real, con la opción de perder la respuesta DESPUÉS del commit: el caso
// en que la compensación no puede borrarle el acceso a un complejo que existe.
const lostResponse = vi.hoisted(() => ({ on: false }))
vi.mock('@/modules/tenants/tenant.service', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/modules/tenants/tenant.service')>()
  return {
    ...real,
    createTenantWithTrial: async (...args: Parameters<typeof real.createTenantWithTrial>) => {
      const tenant = await real.createTenantWithTrial(...args)
      if (lostResponse.on) throw new Error('respuesta perdida')
      return tenant
    },
  }
})

import { captureException } from '@/lib/sentry'
import { isForeignKeyViolation } from '@/shared/db/pg-errors'
import { createAssistedTenant } from '@/modules/tenants/assisted-signup.service'
import type { AssistedSignupInput } from '@/modules/tenants/tenant.schema'

const AUTH_USER_ID = '7c1f3c4e-0000-4000-8000-00000000a001'
const DAY_MS = 24 * 60 * 60 * 1000

function input(overrides: Partial<AssistedSignupInput> = {}): AssistedSignupInput {
  return {
    name: 'Canchas del Sur',
    address: 'Av. Siempreviva 742',
    city: 'Lanús',
    province: 'Buenos Aires',
    phone: '+54 11 5555-1234',
    firstName: 'Marcelo',
    lastName: 'Gómez',
    email: 'marcelo@canchasdelsur.test',
    referral: null,
    ...overrides,
  }
}

async function countRows(): Promise<{ tenants: number; staff: number }> {
  // Tablas globales, conteo cross-tenant a propósito: superusuario.
  const sql = adminSql()
  const [t] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM tenants`
  const [s] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM staff_users`
  return { tenants: t!.n, staff: s!.n }
}

let actor: { id: string; email: string }

beforeAll(async () => {
  await ensureRoles()
}, 30_000)

beforeEach(async () => {
  vi.clearAllMocks()
  lostResponse.on = false
  await cleanupAll()
  actor = await createTestSystemAdmin()
  createUser.mockResolvedValue({ data: { user: { id: AUTH_USER_ID } }, error: null })
  deleteUser.mockResolvedValue({ data: {}, error: null })
})

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('createAssistedTenant — camino feliz', () => {
  it('crea la cuenta con email confirmado, contraseña temporal y los claims del tenant nuevo', async () => {
    const res = await createAssistedTenant(input(), actor)
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.tempPassword).toMatch(/^TG-[0-9a-f]{10}$/)
    expect(createUser).toHaveBeenCalledTimes(1)
    const args = createUser.mock.calls[0]![0]
    expect(args).toMatchObject({
      email: 'marcelo@canchasdelsur.test',
      password: res.tempPassword,
      email_confirm: true,
      app_metadata: {
        tenant_id: res.tenantId,
        role: 'admin',
        force_password_change: true,
        staff_invited: true,
      },
    })

    // El staff_user_id del JWT es la fila real de staff_users (tabla global).
    const sql = adminSql()
    const [staff] = await sql<
      { id: string; first_name: string; last_name: string; phone: string | null }[]
    >`SELECT id, first_name, last_name, phone FROM staff_users WHERE email = ${'marcelo@canchasdelsur.test'}`
    expect(staff).toMatchObject({
      id: args.app_metadata.staff_user_id,
      first_name: 'Marcelo',
      last_name: 'Gómez',
      phone: '+54 11 5555-1234',
    })
  })

  it('crea el complejo en trial de 30 días, con el dueño como admin y la suscripción, visibles para la app', async () => {
    const res = await createAssistedTenant(input(), actor)
    if (!res.ok) throw new Error('alta rechazada')

    // `tenants` es global y sin RLS: superusuario.
    const [tenant] = await adminSql()<
      {
        status: string
        email: string
        phone: string
        trial_ends_at: Date
        referred_by_tenant_id: string | null
        onboarding_step: number
      }[]
    >`
      SELECT status, email, phone, trial_ends_at, referred_by_tenant_id,
             (settings->>'onboarding_step')::int AS onboarding_step
      FROM tenants WHERE id = ${res.tenantId}
    `
    expect(tenant).toMatchObject({
      status: 'trialing',
      email: 'marcelo@canchasdelsur.test',
      phone: '+54 11 5555-1234',
      referred_by_tenant_id: null,
      // El wizard arranca en Horarios: resolveWizardStep = onboarding_step + 1.
      onboarding_step: 1,
    })
    const trialDays = (new Date(tenant!.trial_ends_at).getTime() - Date.now()) / DAY_MS
    expect(trialDays).toBeGreaterThan(TRIAL_DAYS - 0.01)
    expect(trialDays).toBeLessThanOrEqual(TRIAL_DAYS)

    const { members, subs } = await asApp(res.tenantId, async (tx) => ({
      members: await tx<{ role: string; is_active: boolean }[]>`
        SELECT role, is_active FROM tenant_staff_members WHERE tenant_id = ${res.tenantId}`,
      subs: await tx<{ status: string; billed_courts: number }[]>`
        SELECT status, billed_courts FROM tenant_subscriptions WHERE tenant_id = ${res.tenantId}`,
    }))
    expect(members).toEqual([{ role: 'admin', is_active: true }])
    expect(subs).toEqual([{ status: 'trialing', billed_courts: 1 }])
  })

  it('audita support.tenant.created a nombre del super-admin, sin la contraseña', async () => {
    const res = await createAssistedTenant(input(), actor)
    if (!res.ok) throw new Error('alta rechazada')

    const rows = await asApp(
      res.tenantId,
      (tx) => tx<
        {
          actor_id: string
          actor_type: string
          resource_type: string
          resource_id: string
          metadata: Record<string, unknown>
        }[]
      >`
        SELECT actor_id, actor_type, resource_type, resource_id, metadata
        FROM audit_logs WHERE tenant_id = ${res.tenantId} AND action = 'support.tenant.created'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actor_id: actor.id,
      actor_type: 'system',
      resource_type: 'tenant',
      resource_id: res.tenantId,
      metadata: {
        owner_email: 'marcelo@canchasdelsur.test',
        system_admin_email: actor.email,
        referral_code: null,
      },
    })
    expect(JSON.stringify(rows[0])).not.toContain(res.tempPassword)
  })
})

describe('createAssistedTenant — rechazos antes de crear nada', () => {
  it('F5: rechaza el email de un jugador sin tocar Auth ni la base', async () => {
    await createTestPlayer(undefined, { email: 'tomas@jugador.test' })
    const before = await countRows()

    const res = await createAssistedTenant(input({ email: 'tomas@jugador.test' }), actor)

    expect(res).toEqual({ ok: false, reason: 'player_account' })
    expect(createUser).not.toHaveBeenCalled()
    expect(await countRows()).toEqual(before)
  })

  it('rechaza el email de un staff que ya existe', async () => {
    await createTestStaffUser(undefined, { email: 'dueno@otro.test' })
    const before = await countRows()

    const res = await createAssistedTenant(input({ email: 'dueno@otro.test' }), actor)

    expect(res).toEqual({ ok: false, reason: 'staff_account' })
    expect(createUser).not.toHaveBeenCalled()
    expect(await countRows()).toEqual(before)
  })

  it('rechaza un email que ya tiene cuenta de Auth (registro sin confirmar)', async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'email_exists', message: 'already registered' },
    })
    const before = await countRows()

    const res = await createAssistedTenant(input(), actor)

    expect(res).toEqual({ ok: false, reason: 'email_taken' })
    expect(await countRows()).toEqual(before)
  })

  it('si Auth falla por otra cosa, el error que sube trae el código y no el mensaje de GoTrue', async () => {
    // Un mensaje que repite la contraseña: si el service lo copiara al error,
    // terminaría en Sentry y en los logs.
    createUser.mockImplementation(async (args: { password: string }) => ({
      data: { user: null },
      error: { code: 'unexpected_failure', message: `rechazada: ${args.password}` },
    }))
    const before = await countRows()

    const thrown = await createAssistedTenant(input(), actor).catch((e: unknown) => e)

    const password = createUser.mock.calls[0]![0].password as string
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe(
      'createAssistedTenant: createUser falló (unexpected_failure)',
    )
    expect((thrown as Error).message).not.toContain(password)
    expect(await countRows()).toEqual(before)
  })

  it('rechaza un código de referido que no existe, antes de crear la cuenta', async () => {
    const res = await createAssistedTenant(input({ referral: 'ZZZZ9999' }), actor)

    expect(res).toEqual({ ok: false, reason: 'invalid_referral' })
    expect(createUser).not.toHaveBeenCalled()
  })
})

describe('createAssistedTenant — referido', () => {
  it('con el link /r/<CODE> de un complejo, lo asigna como referidor', async () => {
    // Relativo al corte de la promo, no una fecha fija: el test no vence.
    // Solo `Date`: los timers reales siguen andando para el driver de Postgres.
    vi.useFakeTimers({ toFake: ['Date'], now: REFERRAL_PROMO_ENDS_AT.getTime() - DAY_MS })
    const referrer = await createTestTenant()
    await adminSql()`UPDATE tenants SET referral_code = 'AH2K9MZP' WHERE id = ${referrer.id}`

    const res = await createAssistedTenant(
      input({ referral: 'https://turnogol.app/r/ah2k9mzp/' }),
      actor,
    )
    if (!res.ok) throw new Error(`alta rechazada: ${res.reason}`)

    const sql = adminSql()
    const [tenant] = await sql<{ referred_by_tenant_id: string | null }[]>`
      SELECT referred_by_tenant_id FROM tenants WHERE id = ${res.tenantId}`
    expect(tenant!.referred_by_tenant_id).toBe(referrer.id)
    const [staff] = await sql<{ signup_referral_code: string | null }[]>`
      SELECT signup_referral_code FROM staff_users WHERE email = ${'marcelo@canchasdelsur.test'}`
    expect(staff!.signup_referral_code).toBe('AH2K9MZP')
  })
})

describe('createAssistedTenant — falla la base después de crear la cuenta', () => {
  /** Sin plan activo, `createTenantWithTrial` tira DESPUÉS del insert de staff. */
  async function withoutActivePlan(run: () => Promise<void>): Promise<void> {
    const sql = adminSql()
    const active = await sql<{ id: string }[]>`
      UPDATE plans SET is_active = false WHERE is_active = true RETURNING id`
    try {
      await run()
    } finally {
      for (const p of active) await sql`UPDATE plans SET is_active = true WHERE id = ${p.id}`
    }
  }

  async function staffRows(): Promise<readonly unknown[]> {
    // `staff_users` es global: superusuario.
    return adminSql()`SELECT 1 FROM staff_users WHERE email = ${'marcelo@canchasdelsur.test'}`
  }

  /** Lo que el service le mandó a Auth: la contraseña y el id de la fila de staff. */
  function createdAccount(): { password: string; staffUserId: string } {
    const args = createUser.mock.calls[0]![0]
    return { password: args.password, staffUserId: args.app_metadata.staff_user_id }
  }

  it('borra la cuenta de Auth y la fila de staff, y sube el error original', async () => {
    let thrown: unknown
    await withoutActivePlan(async () => {
      thrown = await createAssistedTenant(input(), actor).catch((e: unknown) => e)
    })

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toMatch(/plan activo/)
    expect(deleteUser).toHaveBeenCalledWith(AUTH_USER_ID)
    expect(await staffRows()).toHaveLength(0)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('si no puede borrar la cuenta de Auth, avisa a Sentry con los ids para encontrarla y sin la contraseña', async () => {
    // Un mensaje que repite la contraseña: la compensación tiene que mandar
    // solo el código, igual que el alta.
    deleteUser.mockImplementation(async () => ({
      data: null,
      error: { code: 'unexpected_failure', message: `falló: ${createdAccount().password}` },
    }))

    await withoutActivePlan(async () => {
      await expect(createAssistedTenant(input(), actor)).rejects.toThrow(/plan activo/)
    })

    const { password, staffUserId } = createdAccount()
    expect(captureException).toHaveBeenCalledTimes(1)
    const [err, context] = vi.mocked(captureException).mock.calls[0]!
    expect((err as Error).message).toBe(
      'createAssistedTenant: deleteUser falló (unexpected_failure)',
    )
    expect(context).toEqual({
      tags: { flow: 'assisted_signup_undo' },
      extra: { authUserId: AUTH_USER_ID, staffUserId },
    })
    expect(JSON.stringify(vi.mocked(captureException).mock.calls)).not.toContain(password)
    expect(await staffRows()).toHaveLength(0)
  })

  it('si la transacción commiteó y se perdió la respuesta, NO le borra el acceso al dueño', async () => {
    lostResponse.on = true

    await expect(createAssistedTenant(input(), actor)).rejects.toThrow('respuesta perdida')

    // El complejo quedó entero: borrar la cuenta de Auth lo dejaría sin dueño.
    expect(deleteUser).not.toHaveBeenCalled()
    expect(await staffRows()).toHaveLength(1)
    const [tenant] = await adminSql()<{ id: string }[]>`
      SELECT id FROM tenants WHERE email = ${'marcelo@canchasdelsur.test'}`
    const members = await asApp(
      tenant!.id,
      (tx) => tx`SELECT 1 FROM tenant_staff_members WHERE tenant_id = ${tenant!.id}`,
    )
    expect(members).toHaveLength(1)

    // La compensación corrió y la frenó la membresía: el aviso a Sentry es el
    // DELETE de staff chocando con la FK, no otra falla.
    expect(captureException).toHaveBeenCalledTimes(1)
    const [err, context] = vi.mocked(captureException).mock.calls[0]!
    expect(isForeignKeyViolation(err, 'tenant_staff_members_staff_user_id_fkey')).toBe(true)
    expect(context).toEqual({
      tags: { flow: 'assisted_signup_undo' },
      extra: { authUserId: AUTH_USER_ID, staffUserId: createdAccount().staffUserId },
    })
  })
})
