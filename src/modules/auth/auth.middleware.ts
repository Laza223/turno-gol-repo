import { createClient } from '@/lib/supabase/server'
import type { AuthUser } from './types'

/**
 * Read the Supabase session from cookies and map to AuthUser.
 * Returns null if no session (caller responsible for 401).
 */
export async function extractAuthUser(): Promise<AuthUser | null> {
  const supabase = createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return null
  const user = data.user

  const meta: Record<string, unknown> = user.app_metadata ?? {}
  const userMeta: Record<string, unknown> = user.user_metadata ?? {}
  const email = user.email ?? ''

  if (meta.is_player === true || userMeta.is_player === true) {
    const playerId = typeof meta.player_id === 'string' ? meta.player_id : user.id
    return { type: 'player', id: user.id, playerId, email }
  }
  if (meta.is_system_admin === true) {
    const systemAdminId = typeof meta.system_admin_id === 'string' ? meta.system_admin_id : user.id
    return { type: 'system_admin', id: user.id, email, systemAdminId }
  }
  // Default: staff
  const tenantId = typeof meta.tenant_id === 'string' ? meta.tenant_id : null
  const staffUserId = typeof meta.staff_user_id === 'string' ? meta.staff_user_id : null
  return {
    type: 'staff',
    id: user.id,
    email,
    staffUserId,
    tenantId,
    role: 'admin',
  }
}
