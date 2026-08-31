import { CONTACT_WHATSAPP_DISPLAY, contactWhatsappUrl } from '@/lib/contact'

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

/**
 * Softban de ausencias (reemplaza la deuda por no-show del cambio #5): si la
 * ausencia actual ocurre dentro de esta ventana desde la anterior, cuenta como
 * reincidencia; si no, el contador vuelve a foja cero.
 */
export const NO_SHOW_STRIKE_WINDOW_DAYS = 90

/**
 * Duración del bloqueo de reservas online al llegar a la 2da ausencia dentro
 * de la ventana de reincidencia (`NO_SHOW_STRIKE_WINDOW_DAYS`).
 */
export const NO_SHOW_SOFTBAN_DAYS = 14

/**
 * Días de prueba gratuita. Fijado en `createTenantWithTrial`; se declara acá
 * para que los avisos de abajo se lean contra el mismo número.
 */
export const TRIAL_DAYS = 30

/**
 * Umbrales (en días restantes) a los que se avisa que la prueba se termina.
 * De mayor a menor: el de 7 días da margen para decidir y cargar la tarjeta,
 * el de 1 es el último llamado.
 *
 * Antes no se avisaba NADA: el complejo pasaba a `blocked` de un día para el
 * otro. El cron corre una vez por día, así que un umbral se dispara cuando los
 * días restantes bajan de él, no en un instante exacto — y
 * `tenants.trial_warning_days_sent` (migr. 068) impide repetirlo.
 *
 * Ordenados ASCENDENTE porque el worker elige el umbral más CHICO que todavía
 * aplica, no el primero de la lista. Con `[7, 1]` y un complejo al que le
 * quedan 12 horas, recorrer en orden daría 7 (12 h ≤ 7 días es verdadero) y le
 * mandaría "te quedan 7 días" marcándolo como ya avisado — nunca recibiría el
 * último llamado. Ascendente, el primero que matchea es el correcto.
 */
export const TRIAL_ENDING_WARNING_DAYS = [1, 7] as const

/**
 * Canales oficiales de soporte de TurnoGol (B9).
 */
export const SUPPORT_EMAIL = 'turnogol@gmail.com'
export const SUPPORT_WHATSAPP_NUMBER = CONTACT_WHATSAPP_DISPLAY
export const SUPPORT_WHATSAPP_URL = contactWhatsappUrl()
