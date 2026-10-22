import { isFeatureEnabled } from '@/shared/feature-flags'

/** Clave del flag en `feature_flags`; la fila global se siembra en `false` (migr. 099). */
const RIVAL_FLAG = 'rival'

/**
 * ¿Está prendido RIVAL? Lee SOLO la fila global (tenant_id NULL), sin override
 * por complejo: RIVAL es cross-tenant y un partido no puede estar prendido para
 * un complejo y apagado para otro jugador (decisión de la spec §12; a
 * diferencia de `tournament.flags.ts`, que sí acepta override).
 *
 * Nunca se le pasa `tenantId` a `isFeatureEnabled`: con tenant buscaría la
 * fila de override y una fila perdida por complejo podría prenderlo.
 */
export function isRivalEnabled(): Promise<boolean> {
  return isFeatureEnabled(RIVAL_FLAG)
}
