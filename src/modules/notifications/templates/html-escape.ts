/**
 * Escapa caracteres HTML especiales para interpolación segura dentro de un
 * string `html` de email (security scan F4/F7/F8 — HTML injection vía
 * campos de usuario/tenant sin escapar embebidos en emails transaccionales).
 * NO usar sobre el string `text` (plain text no lo necesita).
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
