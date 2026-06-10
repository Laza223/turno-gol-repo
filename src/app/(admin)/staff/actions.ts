'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { and, count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { staffUsers, tenantStaffMembers } from '@/shared/db/schema'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkPinSessionAction } from '@/app/(admin)/actions/pin'

type AuthUserLite = { id: string; email?: string; app_metadata?: Record<string, unknown> }

/**
 * Busca un auth user por email. supabase-js no expone lookup por email, así que
 * paginamos listUsers de forma acotada. Best-effort: si no se ubica, el callback
 * de login sincroniza staff_user_id igual (#47).
 */
async function findAuthUserByEmail(
  adminClient: SupabaseClient,
  email: string,
): Promise<AuthUserLite | null> {
  const PER_PAGE = 1000
  const MAX_PAGES = 10
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: PER_PAGE })
    const users = data?.users ?? []
    if (error || users.length === 0) return null
    const found = users.find((u) => u.email?.toLowerCase() === email)
    if (found) return found as AuthUserLite
    if (users.length < PER_PAGE) return null
  }
  return null
}

export type StaffActionResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Estados de tenant que bloquean la gestion de staff (Fase 3 #14). Mismo
 * criterio que la reserva online ((public)/[slug]/reservar/actions.ts): solo
 * trialing/active/past_due pueden mutar staff.
 */
const STAFF_WRITE_BLOCKED_STATUSES = [
  'deleted',
  'blocked',
  'canceled',
  'churned',
  'suspended',
]

/**
 * Guard server-side compartido para mutaciones de staff (Fase 3 #13/#14):
 * - Re-valida la sesion de PIN: la cookie tg_pin_session expira a los 30 min y
 *   el PinGate es solo UI, asi que una accion invocada directamente con la
 *   cookie vencida debe rechazarse. Mismo patron que settings/reservas/actions.ts.
 * - Bloquea tenants en estado no operativo (suspended/blocked/canceled/churned/
 *   deleted), que getStaffTenant no filtra.
 * Devuelve un StaffActionResult de error, o null si la mutacion puede continuar.
 */
async function guardStaffMutation(tenant: {
  status: string
}): Promise<{ success: false; error: string } | null> {
  const pinOk = await checkPinSessionAction()
  if (!pinOk) return { success: false, error: 'PIN requerido.' }
  if (STAFF_WRITE_BLOCKED_STATUSES.includes(tenant.status)) {
    return { success: false, error: 'El complejo no está activo.' }
  }
  return null
}

const inviteSchema = z.object({
  email: z.string().email('Email inválido'),
  firstName: z.string().min(1, 'Nombre requerido').max(100),
  lastName: z.string().min(1, 'Apellido requerido').max(100),
})

async function requireStaffTenant() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  return { user, tenant }
}

export async function inviteStaffAction(
  formData: FormData,
): Promise<StaffActionResult> {
  const { user, tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const guard = await guardStaffMutation(tenant)
  if (guard) return guard

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const { email, firstName, lastName } = parsed.data

  const result = await withTenantContext(tenant.id, async (tx) => {
    const existing = await tx
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .innerJoin(tenantStaffMembers, eq(tenantStaffMembers.staffUserId, staffUsers.id))
      .where(
        and(
          eq(staffUsers.email, email.toLowerCase()),
          eq(tenantStaffMembers.tenantId, tenant.id),
          eq(tenantStaffMembers.isActive, true),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      return { success: false as const, error: 'Este email ya es miembro activo del complejo.' }
    }

    const [staffUser] = await tx
      .insert(staffUsers)
      .values({ email: email.toLowerCase(), firstName, lastName })
      .onConflictDoUpdate({
        target: staffUsers.email,
        set: { firstName, lastName },
      })
      .returning({ id: staffUsers.id })

    if (!staffUser) return { success: false as const, error: 'Error creando usuario.' }

    await tx
      .insert(tenantStaffMembers)
      .values({
        tenantId: tenant.id,
        staffUserId: staffUser.id,
        role: 'admin',
        addedBy: user.staffUserId,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [tenantStaffMembers.tenantId, tenantStaffMembers.staffUserId],
        set: { isActive: true, addedBy: user.staffUserId },
      })

    const adminClient = createAdminClient()
    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email.toLowerCase(), {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      })

    if (inviteError && !inviteError.message.includes('already been registered')) {
      return { success: false as const, error: `Error enviando invitación: ${inviteError.message}` }
    }

    if (inviteData?.user?.id) {
      // Usuario nuevo en auth: solo pertenece a este complejo, claim completo.
      await adminClient.auth.admin.updateUserById(inviteData.user.id, {
        app_metadata: {
          staff_user_id: staffUser.id,
          tenant_id: tenant.id,
          role: 'admin',
        },
      })
    } else if (inviteError) {
      // 'already been registered': el usuario ya existe en auth (p. ej. admin de
      // otro complejo). inviteUserByEmail no devuelve su id, así que lo buscamos y
      // sincronizamos SOLO staff_user_id, preservando su tenant_id/role actuales
      // para no pisar la sesión de otros complejos (#47).
      const existingAuth = await findAuthUserByEmail(adminClient, email.toLowerCase())
      if (existingAuth) {
        await adminClient.auth.admin.updateUserById(existingAuth.id, {
          app_metadata: { ...(existingAuth.app_metadata ?? {}), staff_user_id: staffUser.id },
        })
      }
    }

    return { success: true as const }
  })

  if (result.success) revalidatePath('/staff')
  return result
}

export async function deactivateStaffAction(
  staffMemberId: string,
): Promise<StaffActionResult> {
  const { tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const guard = await guardStaffMutation(tenant)
  if (guard) return guard

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const result = await withTenantContext(tenant.id, async (tx) => {
    const [activeCount] = await tx
      .select({ value: count() })
      .from(tenantStaffMembers)
      .where(
        and(
          eq(tenantStaffMembers.tenantId, tenant.id),
          eq(tenantStaffMembers.isActive, true),
        ),
      )

    if (Number(activeCount?.value ?? 0) <= 1) {
      return {
        success: false as const,
        error: 'El complejo debe tener al menos un admin activo.',
      }
    }

    const [updated] = await tx
      .update(tenantStaffMembers)
      .set({ isActive: false })
      .where(
        and(
          eq(tenantStaffMembers.id, staffMemberId),
          eq(tenantStaffMembers.tenantId, tenant.id),
        ),
      )
      .returning({ id: tenantStaffMembers.id })

    if (!updated) return { success: false as const, error: 'Miembro no encontrado.' }
    return { success: true as const }
  })

  if (result.success) revalidatePath('/staff')
  return result
}

export async function resendInviteAction(email: string): Promise<StaffActionResult> {
  const { tenant } = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado.' }

  const guard = await guardStaffMutation(tenant)
  if (guard) return guard

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  // Fase 3 #12: el email no debe ser arbitrario; tiene que pertenecer a un
  // miembro ACTIVO del tenant actual antes de disparar inviteUserByEmail.
  const parsedEmail = z.string().email().safeParse(email)
  if (!parsedEmail.success) return { success: false, error: 'Email inválido.' }
  const normalizedEmail = parsedEmail.data.toLowerCase()

  const member = await withTenantContext(tenant.id, async (tx) =>
    tx
      .select({ id: tenantStaffMembers.id })
      .from(tenantStaffMembers)
      .innerJoin(staffUsers, eq(staffUsers.id, tenantStaffMembers.staffUserId))
      .where(
        and(
          eq(staffUsers.email, normalizedEmail),
          eq(tenantStaffMembers.tenantId, tenant.id),
          eq(tenantStaffMembers.isActive, true),
        ),
      )
      .limit(1),
  )

  if (member.length === 0) {
    return { success: false, error: 'Este email no es un miembro activo del complejo.' }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
  })

  if (error) return { success: false, error: `Error reenviando invitación: ${error.message}` }
  return { success: true }
}
