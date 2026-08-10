/**
 * Gating de lifecycle de tenant por doc4 §2 (P18) — fuente única de verdad.
 *
 * - BLOCKED   → 403 siempre (ni admin ni jugador entran).
 * - READ_ONLY → 403 en métodos que escriben; el admin conserva lectura y el
 *               jugador sigue viendo sus reservas.
 * - canceled  → acceso completo hasta `current_period_end` (el sweep lo pasa a
 *               `blocked` en ese momento).
 * - active / trialing / past_due → acceso completo.
 *
 * Vive acá y no en el middleware que las estrenó (`@/server/middleware/with-tenant`)
 * porque son estados de `tenants.status`, o sea dominio: las consumen tanto el
 * wrapper de route handler como `@/modules/staff/guards.ts` (Server Actions y
 * pages). Con las constantes del lado del middleware, `guards.ts` terminaba
 * importando `@/server` desde `@/modules` — la dirección al revés (B6).
 */

/** Estados en los que el complejo no tiene acceso a nada. */
export const BLOCKED_TENANT_STATUSES = new Set(['blocked', 'churned', 'deleted'])

/** Estados en los que el complejo puede leer pero no escribir. */
export const READ_ONLY_TENANT_STATUSES = new Set(['suspended'])
