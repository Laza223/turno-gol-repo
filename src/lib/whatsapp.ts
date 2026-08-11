/**
 * Builds a wa.me deep link from a free-form WhatsApp number (tenants.whatsapp).
 *
 * The number is normalized to digits only. It is expected to be a full
 * international number (e.g. "+54 9 11 1234-5678"); we do NOT guess a country
 * code, since the stored format varies per complejo. Returns null when there
 * is nothing dial-able so callers can hide the button.
 */
export function buildWhatsappUrl(raw: string | null | undefined, message?: string): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 0) return null
  const base = `https://wa.me/${digits}`
  if (message && message.trim().length > 0) {
    return `${base}?text=${encodeURIComponent(message)}`
  }
  return base
}
