import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { tagSession } from '@/shared/middleware/observability'
import { resolveImpersonatedStaffContextFor } from '@/modules/auth/impersonation.server'
import type { AuthUser } from './types'

/**
 * Identidad REAL de la sesión (lo que dice el JWT de Supabase), sin aplicar
 * impersonación. La usan el guard de SuperAdmin y el resolver de impersonación
 * para no auto-engañarse con la cookie que ellos mismos manejan.
 *
 * Cacheado por request (React.cache): layout, shell y página comparten una
 * sola lectura de `supabase.auth.getUser()` en lugar de repetirla N veces.
 */
export const extractRealAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return null
  const user = data.user

  const meta: Record<string, unknown> = user.app_metadata ?? {}
  const userMeta: Record<string, unknown> = user.user_metadata ?? {}
  const email = user.email ?? ''

  if (meta.is_player === true || userMeta.is_player === true) {
    const playerId = typeof meta.player_id === 'string' ? meta.player_id : user.id
    tagSession(null, playerId, 'player')
    return { type: 'player', id: user.id, playerId, email }
  }
  if (meta.is_system_admin === true) {
    const systemAdminId = typeof meta.system_admin_id === 'string' ? meta.system_admin_id : user.id
    tagSession(null, systemAdminId, 'system_admin')
    return { type: 'system_admin', id: user.id, email, systemAdminId }
  }
  // Default: staff
  const tenantId = typeof meta.tenant_id === 'string' ? meta.tenant_id : null
  const staffUserId = typeof meta.staff_user_id === 'string' ? meta.staff_user_id : null
  tagSession(tenantId, staffUserId ?? user.id, 'staff')
  return {
    type: 'staff',
    id: user.id,
    email,
    staffUserId,
    tenantId,
    role: 'admin',
  }
})

/**
 * Identidad EFECTIVA de la request, con impersonación aplicada (spec §6).
 *
 * Punto único del bypass: si la sesión real es un system_admin con una cookie
 * `tg_sa_impersonate` válida, devuelve el contexto staff sintético del tenant
 * impersonado (rol 'admin', con el staff_user_id de un admin real del tenant
 * como proxy para los FKs). Para cualquier otra sesión, devuelve la identidad
 * real sin tocar nada.
 *
 * Así, los ~40 server actions, los guards (`requireAdminStaff`,
 * `requireOperatorStaff`, los `requireStaffTenant` locales) y las páginas
 * read-only del admin funcionan impersonadas sin modificarse: todas leen de acá.
 * El guard de SuperAdmin usa `extractRealAuthUser` para ver la identidad real.
 */
export const extractAuthUser = cache(async (): Promise<AuthUser | null> => {
  const real = await extractRealAuthUser()
  if (!real || real.type !== 'system_admin') return real
  const imp = await resolveImpersonatedStaffContextFor(real)
  return imp ? imp.user : real
})
