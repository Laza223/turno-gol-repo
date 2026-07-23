/**
 * UUIDs deterministas para fixtures de Storybook. Formato UUIDv4 válido
 * (versión `4`, variante `8`) pero legible a ojo: el número que se le pasa
 * queda a la vista en el segmento final, así se puede rastrear qué fixture
 * referencia a qué entidad sin generar nada al azar.
 *
 * Convención de rangos por dominio (para no pisarse entre fixtures):
 *   1-99      tenants
 *   101-199   courts
 *   201-299   players
 *   301-399   staff (staff_users / tenant_staff_members)
 *   501-599   abonados
 *   601-699   cash_flows / daily_cash_closes
 *   801-849   canteen_products
 *   851-899   stock_movements
 *   901-949   canteen_tabs
 *   1001-1999 bookings
 *   7001-7099 super-admin (planes, trials/signups/webhooks del dashboard global)
 *   7101-7199 super-admin (audit_logs / bookings del tenant activity tab)
 *   9001-9999 payments (mercadopago payment id / preference id)
 */
export const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
