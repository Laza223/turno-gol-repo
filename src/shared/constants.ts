/** Constantes globales del dominio. */

/**
 * Duración fija de un turno en minutos. Decisión de producto (cambio #6): los
 * complejos solo ofrecen turnos de 60 min. Reemplaza al viejo campo configurable
 * `booking_duration_minutes` de tenant settings (dead code, eliminado en #14).
 */
export const SLOT_DURATION_MINUTES = 60

/**
 * INV-ABUSE-001 (Denial of Inventory): tope duro de bookings `pending_payment`
 * (holds sin pagar) que un mismo jugador puede tener a la vez en el mismo
 * tenant. Defensa de negocio, complementaria al rate-limit por IP/player —
 * ver docs/superpowers/specs/2026-07-02-inv-abuse-001-rate-limiting-design.md.
 */
export const MAX_ACTIVE_HOLDS_PER_PLAYER = 3
