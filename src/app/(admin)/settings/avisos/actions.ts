'use server'

import { revalidatePath } from 'next/cache'
import { sql, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireAdminStaffAction } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { tenants } from '@/shared/db/schema'

export type AvisosActionResult =
  | { success: true }
  | { success: false; error: string }

const avisosSchema = z.object({
  dailySummaryEmailOptIn: z.boolean(),
})

export async function updateAvisosSettingsAction(
  _prevState: AvisosActionResult,
  formData: FormData,
): Promise<AvisosActionResult> {
  const auth = await requireAdminStaffAction()
  if (!auth.ok) return { success: false, error: auth.error }
  const { tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  const parsed = avisosSchema.safeParse({
    dailySummaryEmailOptIn: formData.get('dailySummaryEmailOptIn') === 'true',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  const patch = {
    daily_summary_email_opt_in: parsed.data.dailySummaryEmailOptIn,
  }

  // Sin JSON.stringify: ver nota en settings/reservas/actions.ts (el objeto
  // pre-serializado llega como escalar jsonb y `objeto || escalar` concatena
  // como array, destruyendo los settings).
  await withTenantContext(tenant.id, async (tx) => {
    await tx
      .update(tenants)
      .set({
        settings: sql`settings || ${patch}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id))
  })

  revalidatePath('/settings/avisos')
  return { success: true }
}
