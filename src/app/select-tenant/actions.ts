'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import {
  resolveStaffTenants,
  setStaffTenantClaim,
} from '@/modules/auth/auth.service'
import { track } from '@/shared/observability'
import { isMemberTenant } from './select-tenant.utils'

const tenantIdSchema = z.guid()

/**
 * Staff con N>1 complejos elige uno. Setea el claim tenant_id en el JWT y entra
 * al panel. Antes esta acción no existía y el callback redirigía a /select-tenant
 * (404), dejando al staff multi-tenant sin forma de entrar (BLOCKER triage #8).
 */
export async function selectTenantAction(formData: FormData): Promise<void> {
  const parsedTenantId = tenantIdSchema.safeParse(formData.get('tenantId'))
  if (!parsedTenantId.success) redirect('/select-tenant?error=invalid')
  const tenantId = parsedTenantId.data

  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenants = await resolveStaffTenants(user.staffUserId)
  // Defensa: rechaza tenants a los que el staff no pertenece. ENS-20:
  // resolveStaffTenants ya NO filtra por status (solo excluye `deleted`) — un
  // tenant suspended/blocked/etc. puede aparecer acá; entrar cae en
  // (admin)/layout.tsx → /suspended → /reactivar, no es un bypass.
  if (!isMemberTenant(tenantId, tenants)) redirect('/select-tenant?error=invalid')

  await setStaffTenantClaim(user.id, tenantId, user.staffUserId)
  // Refresh para que el nuevo app_metadata.tenant_id aparezca en el próximo JWT.
  const supabase = await createClient()
  await supabase.auth.refreshSession()

  track.auth('staff.login', { staffUserId: user.staffUserId, tenantCount: tenants.length })
  redirect('/dashboard')
}
