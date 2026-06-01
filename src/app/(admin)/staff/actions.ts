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
import { createAdminClient } from '@/lib/supabase/admin'

export type StaffActionResult =
  | { success: true }
  | { success: false; error: string }

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
      await adminClient.auth.admin.updateUserById(inviteData.user.id, {
        app_metadata: {
          staff_user_id: staffUser.id,
          tenant_id: tenant.id,
          role: 'admin',
        },
      })
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

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
  })

  if (error) return { success: false, error: `Error reenviando invitación: ${error.message}` }
  return { success: true }
}
