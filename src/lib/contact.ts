/**
 * Canal de contacto de TurnoGol (la empresa), fuente única.
 *
 * OJO — no confundir con `src/lib/whatsapp.ts`: ese arma el link al WhatsApp
 * DEL COMPLEJO (`tenants.whatsapp`, dato por-tenant que se muestra en el perfil
 * público). Este es NUESTRO número, el del CTA comercial de las páginas de
 * marketing.
 *
 * Por qué vive en una constante y no inline en cada CTA: hasta 2026-08-09 el
 * único CTA que existía apuntaba a `wa.me/5491100000000` — un placeholder que
 * nunca se reemplazó y que llevaba a un número inexistente. Estuvo publicado en
 * todas las páginas editoriales. `tests/unit/contact-whatsapp.test.ts` es el
 * candado: falla si el número vuelve a tener pinta de placeholder Y si alguien
 * hardcodea otro `wa.me/<dígitos>` fuera de este archivo.
 */

/** Solo dígitos, formato que espera wa.me (país + área + número, sin + ni espacios). */
export const CONTACT_WHATSAPP_DIGITS = '5492323346976'

/** Para mostrar en pantalla. */
export const CONTACT_WHATSAPP_DISPLAY = '+54 9 2323 34-6976'

/**
 * Link de WhatsApp al contacto comercial. `message` se pre-carga en el chat;
 * sin él, abre la conversación vacía.
 */
export function contactWhatsappUrl(message?: string): string {
  const base = `https://wa.me/${CONTACT_WHATSAPP_DIGITS}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}
