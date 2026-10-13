type Metadata = Record<string, unknown>

/**
 * Claims de staff o superadmin en `app_metadata`, que solo escribe el servidor
 * (service role). Es el criterio de `account_conflict` del callback: una cuenta
 * así nunca se reclasifica como jugador.
 */
export function hasStaffOrAdminClaims(appMeta: Metadata): boolean {
  return Boolean(appMeta.tenant_id || appMeta.staff_user_id || appMeta.is_system_admin === true)
}

/**
 * ¿La cuenta es de jugador? Manda `app_metadata.is_player`, que graba el
 * callback. `user_metadata` lo edita el propio usuario con
 * `auth.updateUser({ data })`, así que su `is_player` solo cuenta en la ventana
 * de alta: el magic link lo manda en `options.data` y el callback lo necesita
 * para provisionar antes de que exista `app_metadata.is_player`. Con claims de
 * staff o superadmin ya grabados no reclasifica nada; antes, una cuenta staff
 * así quedaba afuera del panel (login y middleware la trataban como jugador).
 */
export function isPlayerAccount(user: {
  app_metadata?: Metadata
  user_metadata?: Metadata
}): boolean {
  const appMeta = user.app_metadata ?? {}
  if (appMeta.is_player === true) return true
  return user.user_metadata?.is_player === true && !hasStaffOrAdminClaims(appMeta)
}
