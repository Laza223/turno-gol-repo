import { escapeHtml } from './html-escape'
import { buildWhatsappUrl } from '@/lib/whatsapp'

export type TenantContactFields = {
  tenantName: string
  tenantPhone: string
  tenantWhatsapp: string | null
  tenantEmail: string
}

/**
 * Bloque "cómo hablar con el complejo" para los mails al jugador.
 *
 * Existe porque los mails de cancelación decían "contactá directamente al
 * complejo" sin dar ningún canal — y son justo los mails donde el jugador se
 * entera de que le tienen que devolver la seña. El reembolso automático de
 * MercadoPago falla siempre (403 de permisos), así que la devolución la hace el
 * complejo y hace falta poder escribirle.
 *
 * La cascada `whatsapp ?? phone` es la misma de `resolveTenantContact`: el
 * campo de WhatsApp es opcional y casi nunca está cargado. El link se omite si
 * no hay número marcable; el teléfono y el email siempre se muestran, y los dos
 * son NOT NULL en la base.
 */
export function tenantContactHtml(
  data: TenantContactFields,
  intro: string,
  message?: string,
): string {
  const whatsappUrl = buildWhatsappUrl(data.tenantWhatsapp ?? data.tenantPhone, message)
  const whatsappLine = whatsappUrl
    ? `<p style="margin:4px 0"><a href="${whatsappUrl}" style="color:#16a34a;font-weight:600">Escribirle por WhatsApp</a></p>`
    : ''
  return `
  <div style="margin:16px 0;padding:12px 16px;background:#f8fafc;border-radius:8px">
    <p style="margin:0 0 8px;font-weight:600">${escapeHtml(intro)}</p>
    ${whatsappLine}
    <p style="margin:4px 0;color:#475569">Teléfono: ${escapeHtml(data.tenantPhone)}</p>
    <p style="margin:4px 0;color:#475569">Email: ${escapeHtml(data.tenantEmail)}</p>
  </div>`
}

/** Misma información para la parte de texto plano del mail. */
export function tenantContactText(data: TenantContactFields, intro: string): string {
  return `${intro}\n${data.tenantName}\nTeléfono: ${data.tenantPhone}\nEmail: ${data.tenantEmail}`
}
