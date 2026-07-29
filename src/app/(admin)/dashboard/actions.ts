'use server'

import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireAdminStaffAction, requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { tenants } from '@/shared/db/schema'

export type MarkSharedResult = { success: true } | { success: false; error: string }

/**
 * Fix 3 (R5 🟢 residual — R2-1 CERRADO salvo este): usaba extractAuthUser +
 * getStaffTenant crudo, sin pasar por `isBlockedForStaff` — un tenant
 * `blocked`/`suspended` podía tildar el checklist del dashboard por POST
 * directo aunque el resto de las actions ya estuviera cerrado con M5.
 * `requireOperatorStaff()` (mismo guard central que el resto de
 * `(admin)/*\/actions.ts`) cubre sesión + rol + tenant.status en un solo
 * punto.
 */
export async function markPublicLinkSharedAction(): Promise<MarkSharedResult> {
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

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
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

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

/**
 * Persiste `checklist_dismissed_at`: el admin descartó manualmente la
 * checklist de onboarding — a nivel TENANT, no por-usuario. Solo admin
 * (requireAdminStaffAction): el manager no puede descartarla para todo el
 * complejo.
 */
export async function markChecklistDismissedAction(): Promise<MarkChecklistDismissedResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

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
