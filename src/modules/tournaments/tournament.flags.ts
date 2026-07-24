/**
 * Feature flag del módulo Torneos.
 *
 * La fila global (tenant_id NULL) se siembra en `false` en la migración 062: la
 * feature nace apagada para todos. Se prende por complejo insertando una fila de
 * override con tenant_id, sin redeploy — el piloto arranca con 2 o 3 complejos.
 *
 * Resolución: override del tenant → global → false (los flags desconocidos están
 * apagados). Cachea 60s in-process; ver src/shared/feature-flags.ts.
 */
export const TOURNAMENTS_FLAG = 'tournaments'
