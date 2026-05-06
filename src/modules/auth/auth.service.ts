import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSql } from '@/shared/db/client'
import { extractAuthUser } from './auth.middleware'
import type { AuthUser } from './types'

export type SignInResult = { ok: true } | { ok: false; error: string }

export async function signInWithMagicLink(
  email: string,
  redirectTo: string,
): Promise<SignInResult> {
  const supabase = createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function signInWithGoogle(
  redirectTo: string,
): Promise<{ url: string | null; error?: string }> {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })
  if (error) return { url: null, error: error.message }
  return { url: data?.url ?? null }
}

export async function signOut(): Promise<void> {
  const supabase = createClient()
  await supabase.auth.signOut()
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  return extractAuthUser()
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
  const sql = getSql()
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
      AND t.status NOT IN ('suspended','blocked','churned','deleted')
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

export async function getOrCreateStaffUser(
  email: string,
  firstName: string,
  lastName: string,
  phone: string | null = null,
): Promise<{ id: string }> {
  const sql = getSql()
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
