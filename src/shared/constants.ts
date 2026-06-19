/** Constantes globales del dominio. */

/**
 * Duración fija de un turno en minutos. Decisión de producto (cambio #6): los
 * complejos solo ofrecen turnos de 60 min. Reemplaza al viejo campo configurable
 * `booking_duration_minutes` de tenant settings (dead code, eliminado en #14).
 */
export const SLOT_DURATION_MINUTES = 60
