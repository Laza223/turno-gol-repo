import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWorkerSql } from '@/shared/db/client'
import { track } from '@/shared/observability'

export type SignInResult = { ok: true } | { ok: false; error: string }

export type PlayerProfile = {
  firstName: string
  lastName: string
  agreedTerms: boolean
  termsVersion: string
}

/**
 * Magic link for the player booking flow. `options.data` persists to
 * `user_metadata`; the auth callback reads `is_player` + profile to provision
 * the player and set durable `app_metadata`.
 */
export async function signInWithPlayerMagicLink(
  email: string,
  redirectTo: string,
  profile: PlayerProfile,
): Promise<SignInResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        is_player: true,
        first_name: profile.firstName,
        last_name: profile.lastName,
        agreed_terms: profile.agreedTerms,
        terms_version: profile.termsVersion,
      },
    },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Magic link de re-acceso para un jugador EXISTENTE con sesión vencida que cae
 * en `/ingresar` (form passwordless del jugador). Sin perfil: el callback resuelve
 * nombre desde el metadata previo / email y no pisa el consentimiento ya dado.
 */
export async function signInWithExistingPlayerMagicLink(
  email: string,
  redirectTo: string,
): Promise<SignInResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, data: { is_player: true } },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export type PasswordSignInResult =
  | { ok: true; user: User }
  | { ok: false; code: 'invalid_credentials' | 'email_not_confirmed' }

/**
 * Login de staff por email + contraseña. No revela al caller si el email existe:
 * cualquier fallo de credenciales o de confirmación se mapea a un código acotado
 * que la action traduce a un mensaje genérico (ver §6.2 enumeración de usuarios).
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<PasswordSignInResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data?.user) {
    const code = error?.code === 'email_not_confirmed' ? 'email_not_confirmed' : 'invalid_credentials'
    return { ok: false, code }
  }
  return { ok: true, user: data.user }
}

/**
 * Alta de staff por email + contraseña. Con `enable_confirmations=true` Supabase
 * NO crea sesión: manda el email de confirmación (template `signup`/token_hash) y
 * el callback provisiona al hacer click. El perfil viaja en `options.data` igual
 * que el flujo OTP previo y lo persiste `getOrCreateStaffUser` en el callback.
 */
export async function signUpStaff(
  params: { email: string; password: string; firstName: string; lastName: string; phone: string },
  emailRedirectTo: string,
): Promise<SignInResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      emailRedirectTo,
      data: {
        first_name: params.firstName,
        last_name: params.lastName,
        phone: params.phone,
      },
    },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export type StaffTenantRow = {
  tenantId: string
  tenantName: string
  tenantSlug: string
  role: string
}

export async function resolveStaffTenants(
  staffUserId: string,
): Promise<StaffTenantRow[]> {
  // Runs before any tenant_id is known (that's what it's resolving) — RLS on
  // staff_users/tenant_staff_members requires app.current_tenant_id, which
  // doesn't exist yet here. Needs a bypass-capable pool, same as background
  // jobs (CLAUDE.md: "Workers usan rol de servicio separado").
  //
  // ENS-20: solo excluye `deleted` (datos ya eliminados/anonimizados). Antes
  // excluía también suspended/blocked/churned — un dueño moroso ni siquiera
  // podía loguearse a ver el aviso o pagar (provisionAndRouteStaff lo mandaba
  // a /onboarding como si no tuviera complejo, tenants.length === 0). Ahora
  // entra y el gate de (admin)/layout.tsx lo redirige a /suspended → /reactivar.
  const sql = getWorkerSql()
  const rows = await sql<StaffTenantRow[]>`
    SELECT
      tsm.tenant_id    AS "tenantId",
      t.name           AS "tenantName",
      t.slug           AS "tenantSlug",
      tsm.role         AS role
    FROM tenant_staff_members tsm
    JOIN tenants t ON t.id = tsm.tenant_id
    WHERE tsm.staff_user_id = ${staffUserId}
      AND tsm.is_active = true
      AND t.status != 'deleted'
    ORDER BY tsm.created_at ASC
  `
  return rows
}

export async function setStaffTenantClaim(
  authUserId: string,
  tenantId: string,
  staffUserId: string,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    app_metadata: { tenant_id: tenantId, role: 'admin', staff_user_id: staffUserId },
  })
  if (error) throw new Error(`Failed to set tenant claim: ${error.message}`)
}

async function getOrCreateStaffUser(
  email: string,
  firstName: string,
  lastName: string,
  phone: string | null = null,
): Promise<{ id: string }> {
  // Runs before any tenant_id is known (that's what it's resolving) — RLS on
  // staff_users/tenant_staff_members requires app.current_tenant_id, which
  // doesn't exist yet here. Needs a bypass-capable pool, same as background
  // jobs (CLAUDE.md: "Workers usan rol de servicio separado").
  const sql = getWorkerSql()
  const lower = email.toLowerCase()
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM staff_users WHERE email = ${lower} LIMIT 1
  `
  if (existing.length > 0) return existing[0]
  const created = await sql<{ id: string }[]>`
    INSERT INTO staff_users (email, first_name, last_name, phone)
    VALUES (${lower}, ${firstName}, ${lastName}, ${phone})
    RETURNING id
  `
  return created[0]
}

async function getStaffUserById(id: string): Promise<{ id: string } | null> {
  const sql = getWorkerSql()
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM staff_users WHERE id = ${id} LIMIT 1
  `
  return rows[0] ?? null
}

/**
 * ¿El email ya pertenece a OTRO staff_user? Lo usa `updateUserEmailAction`
 * ANTES de pedirle el cambio a Supabase Auth — `staff_users.email` tiene
 * UNIQUE, así que sin este pre-check `syncStaffUserEmail` fallaría al
 * confirmar (el UPDATE violaría la constraint) con el usuario ya pensando
 * que el cambio quedó en curso.
 */
export async function isStaffEmailTaken(
  email: string,
  excludeStaffUserId: string,
): Promise<boolean> {
  const sql = getWorkerSql()
  const lower = email.trim().toLowerCase()
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM staff_users WHERE email = ${lower} AND id != ${excludeStaffUserId} LIMIT 1
  `
  return rows.length > 0
}

/**
 * Sincroniza `staff_users.email` tras un cambio de email confirmado en
 * Supabase Auth (`type=email_change` en el callback). NO se llama al pedir el
 * cambio (`updateUserEmailAction`) — recién en la confirmación el email nuevo
 * es real; sincronizarlo antes dejaría el login roto con el email viejo
 * mientras la confirmación está pendiente.
 */
export async function syncStaffUserEmail(staffUserId: string, email: string): Promise<void> {
  const sql = getWorkerSql()
  const lower = email.trim().toLowerCase()
  await sql`UPDATE staff_users SET email = ${lower} WHERE id = ${staffUserId}`
}

/**
 * Única fuente de verdad de provisión + claims + ruteo del staff. Antes vivía
 * inline en el callback; ahora la invocan el callback (confirmación de alta,
 * type=signup) y `loginAction` (tras signInWithPassword). Graba EXACTAMENTE los
 * mismos claims (`staff_user_id`, `tenant_id`, `role`) y ejecuta `refreshSession`
 * — si no, el primer request entra sin claims y caen guards + RLS (riesgo R1/R3).
 */
export async function provisionAndRouteStaff(user: User): Promise<{ path: string }> {
  const email = user.email
  if (!email) throw new Error('provisionAndRouteStaff: user without email')

  const userMeta: Record<string, unknown> = user.user_metadata ?? {}
  const meta: Record<string, unknown> = user.app_metadata ?? {}
  const givenName = typeof userMeta.given_name === 'string' ? userMeta.given_name : null
  const familyName = typeof userMeta.family_name === 'string' ? userMeta.family_name : null
  const firstNameMeta = typeof userMeta.first_name === 'string' ? userMeta.first_name : null
  const lastNameMeta = typeof userMeta.last_name === 'string' ? userMeta.last_name : null
  const phoneMeta = typeof userMeta.phone === 'string' ? userMeta.phone : null
  const firstName = firstNameMeta ?? givenName ?? email.split('@')[0]
  const lastName = lastNameMeta ?? familyName ?? ''

  // Resolución robusta: si el JWT ya trae `staff_user_id` (login/confirmación
  // previa), resolver por ESE id en vez de por email. Un cambio de email
  // confirmado (`type=email_change`) llega acá con `user.email` YA actualizado
  // en Supabase Auth pero, en el momento en que esto corre, `staff_users.email`
  // todavía tiene el email viejo (la sync ocurre en el callback, no acá) — si
  // se resolviera por email se creaba un staff_user huérfano sin tenants.
  // Fallback a email solo cuando no hay staff_user_id en metadata (alta nueva).
  const staffUserIdMeta = typeof meta.staff_user_id === 'string' ? meta.staff_user_id : null
  let ourStaff: { id: string }
  if (staffUserIdMeta) {
    const existing = await getStaffUserById(staffUserIdMeta)
    if (!existing) {
      throw new Error(
        `provisionAndRouteStaff: staff_user_id ${staffUserIdMeta} en metadata no existe en staff_users`,
      )
    }
    ourStaff = existing
  } else {
    ourStaff = await getOrCreateStaffUser(email, firstName, lastName, phoneMeta)
  }
  const tenants = await resolveStaffTenants(ourStaff.id)

  const supabase = await createClient()

  if (tenants.length === 0) {
    // Set staff_user_id so they pass the layout checks, even without a tenant.
    const adminClient = createAdminClient()
    await adminClient.auth.admin.updateUserById(user.id, {
      app_metadata: { ...meta, staff_user_id: ourStaff.id },
    })
    await supabase.auth.refreshSession()
    track.auth('staff.onboarding', { staffUserId: ourStaff.id, tenantCount: 0 })
    return { path: '/onboarding' }
  }

  if (tenants.length === 1) {
    await setStaffTenantClaim(user.id, tenants[0].tenantId, ourStaff.id)
    // Force refresh so the new app_metadata.tenant_id appears in the next JWT.
    await supabase.auth.refreshSession()
    track.auth('staff.login', { staffUserId: ourStaff.id, tenantCount: 1 })
    return { path: '/dashboard' }
  }

  // N tenants → user picks one at /select-tenant (page + selectTenantAction set
  // the tenant_id claim and refresh the session before entering /dashboard).
  track.auth('staff.login', { staffUserId: ourStaff.id, tenantCount: tenants.length })
  return { path: '/select-tenant' }
}
