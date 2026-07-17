'use server'

import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { tenants } from '@/shared/db/schema'

export type MarkSharedResult = { success: true } | { success: false; error: string }

export async function markPublicLinkSharedAction(): Promise<MarkSharedResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'No encontramos tu complejo.' }

  const limited = await adminRateLimited(tenant.id)
  if (limited) {
    return { success: false, error: limited }
  }

  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({
        settings: sql`settings || '{"public_link_shared": true}'::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id))
  })

  revalidatePath('/dashboard')
  return { success: true }
}

export type MarkTourSeenResult = { success: true } | { success: false; error: string }

/** Persiste `admin_tour_seen_at`: el tour de coachmarks del dashboard no vuelve a mostrarse. */
export async function markTourSeenAction(): Promise<MarkTourSeenResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'No encontramos tu complejo.' }

  const limited = await adminRateLimited(tenant.id)
  if (limited) {
    return { success: false, error: limited }
  }

  // El objeto va SIN JSON.stringify: pre-serializado llega como escalar jsonb
  // y `objeto || escalar` concatena como array, corrompiendo settings.
  const patch = { admin_tour_seen_at: new Date().toISOString() }

  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({
        settings: sql`settings || ${patch}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id))
  })

  revalidatePath('/dashboard')
  return { success: true }
}

export type MarkChecklistDismissedResult = { success: true } | { success: false; error: string }

/** Persiste `checklist_dismissed_at`: el admin descartó manualmente la checklist de onboarding. */
export async function markChecklistDismissedAction(): Promise<MarkChecklistDismissedResult> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return { success: false, error: 'No encontramos tu complejo.' }

  const limited = await adminRateLimited(tenant.id)
  if (limited) {
    return { success: false, error: limited }
  }

  const patch = { checklist_dismissed_at: new Date().toISOString() }

  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({
        settings: sql`settings || ${patch}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id))
  })

  revalidatePath('/dashboard')
  return { success: true }
}
