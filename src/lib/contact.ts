/**
 * Canales de contacto de TurnoGol (la empresa), fuente única.
 *
 * OJO — no confundir con `src/lib/whatsapp.ts`: ese arma el link al WhatsApp
 * DEL COMPLEJO (`tenants.whatsapp`, dato por-tenant que se muestra en el perfil
 * público). Estos son LOS NUESTROS: el CTA comercial y el soporte.
 *
 * Por qué viven en constantes y no inline en cada CTA: hasta 2026-08-09 el
 * único CTA que existía apuntaba a `wa.me/5491100000000` — un placeholder que
 * nunca se reemplazó y que llevaba a un número inexistente. Estuvo publicado en
 * todas las páginas editoriales. `tests/unit/contact-whatsapp.test.ts` es el
 * candado: falla si el número vuelve a tener pinta de placeholder Y si alguien
 * hardcodea otro `wa.me/<dígitos>` o un `instagram.com/<usuario>` fuera de este
 * archivo.
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

/** Usuario de Instagram, sin `@`: es lo que va en la URL y lo que se muestra. */
export const CONTACT_INSTAGRAM_HANDLE = 'turnogol'

/** Perfil de Instagram de TurnoGol. */
export function contactInstagramUrl(): string {
  return `https://instagram.com/${CONTACT_INSTAGRAM_HANDLE}`
}

/**
 * Casilla pública de contacto.
 *
 * NO es `SUPPORT_EMAIL` (`src/shared/constants.ts`, un Gmail): esa la usan el
 * banner de cuenta suspendida y `/reactivar`, y son dos buzones distintos a
 * propósito. Acá vive el que ya publicaban los dos pies de página, que hasta
 * ahora estaba escrito a mano en cada uno.
 */
export const CONTACT_EMAIL = 'hola@turnogol.app'

/** `href` del mail de contacto, con asunto opcional. */
export function contactMailtoUrl(subject?: string): string {
  const base = `mailto:${CONTACT_EMAIL}`
  return subject ? `${base}?subject=${encodeURIComponent(subject)}` : base
}

/**
 * Teléfono legible → valor de un `href="tel:"` válido.
 *
 * F-013 (QA de producción 2026-08-17): el perfil público generaba
 * `tel:+54 1164458855`. Los espacios no son válidos en un URI `tel:` (RFC 3966)
 * y algunos discadores lo rechazan sin decir por qué. Se conservan solo los
 * dígitos y el `+` inicial si lo había; el formato lindo sigue siendo el TEXTO
 * del link, que es donde importa que se lea bien.
 *
 * Devuelve `null` si no queda ningún dígito — quien llama decide si esconde el
 * link o lo muestra sin `href`.
 */
export function telHref(phone: string | null | undefined): string | null {
  const raw = (phone ?? '').trim()
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  return `tel:${raw.startsWith('+') ? '+' : ''}${digits}`
}
