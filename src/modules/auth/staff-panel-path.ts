import type { AuthUser } from './types'

/**
 * A qué panel mandar a alguien que YA tiene sesión y llega a una página
 * pública. `null` significa "no mostrar ningún acceso".
 *
 * Se resuelve solo con lo que el JWT ya trae, sin una consulta nueva: lo llama
 * `/api/player/session`, que la portada pide en cada carga. Los tres casos de
 * cantidad de complejos salen bien sin resolver la lista porque
 * `/select-tenant` ya es el router (src/app/select-tenant/page.tsx:22-27):
 * corta a `/login` si no es staff y manda a `/onboarding` con cero complejos.
 * Duplicar `resolveStaffTenants` acá además colgaría el pool que saltea RLS de
 * un endpoint que llama la página más visitada del sitio.
 *
 * | staff con complejo asignado     | /dashboard     |
 * | staff sin complejo asignado     | /select-tenant |
 * | staff sin `staffUserId`         | null           |
 * | jugador                         | null           |
 * | superadmin                      | /super-admin   |
 *
 * La guarda de `staffUserId` es obligatoria, no defensiva de más: en
 * `auth.middleware.ts` staff es el tipo POR DEFECTO — cualquier usuario que no
 * sea `is_player` ni `is_system_admin` cae ahí, incluso una cuenta a medio
 * aprovisionar con `staffUserId` y `tenantId` en null. Sin esta guarda, esa
 * cuenta vería un botón que la devuelve a `/login`.
 */
export function resolveStaffPanelPath(user: AuthUser | null): string | null {
  if (!user) return null
  if (user.type === 'system_admin') return '/super-admin'
  // El jugador ya tiene su propio acceso en el portal (AccountMenu).
  if (user.type !== 'staff') return null
  if (!user.staffUserId) return null
  return user.tenantId ? '/dashboard' : '/select-tenant'
}
