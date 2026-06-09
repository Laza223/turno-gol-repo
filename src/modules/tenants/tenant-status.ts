/**
 * Tenant statuses that must be hidden from every public surface: el perfil
 * publico, la grilla de disponibilidad, el checkout de reserva y la API
 * publica `/api/public/availability`. Es la fuente de verdad unica para
 * decidir si un complejo es visible/operable de cara al jugador.
 *
 * Equivale al set `UNAVAILABLE` replicado en las paginas (public)/[slug]/*.
 */
export const UNAVAILABLE_TENANT_STATUSES = new Set<string>([
  'suspended',
  'blocked',
  'canceled',
  'churned',
  'deleted',
])

/** True cuando el complejo puede mostrarse/operarse en superficies publicas. */
export function isTenantPubliclyVisible(status: string): boolean {
  return !UNAVAILABLE_TENANT_STATUSES.has(status)
}
