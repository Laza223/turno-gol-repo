/** Link de WhatsApp con el mensaje para compartir el link de referidos (banner de Hoy y `/settings/invitar`). */
export function buildReferralWhatsappHref(tenantName: string, url: string): string {
  const message = `Te paso TurnoGol, lo uso en ${tenantName} para los turnos y la caja. Lo probás 30 días gratis, sin tarjeta: ${url}`
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}
