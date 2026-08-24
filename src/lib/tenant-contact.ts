import { buildWhatsappUrl } from './whatsapp'
import { telHref } from './contact'

export type TenantContactSource = {
  /** `tenants.whatsapp` — opcional, es el canal preferido si está cargado. */
  whatsapp?: string | null
  /** `tenants.phone` — NOT NULL en la base, así que siempre hay algo acá. */
  phone: string
  /**
   * `tenants.email` — NOT NULL en la base, así que quien lo tenga a mano
   * siempre puede pasarlo. Opcional acá porque el perfil público no lo publica.
   */
  email?: string | null
}

export type TenantContact = {
  /** `null` si no hay ningún número marcable: quien llama esconde el botón. */
  whatsappUrl: string | null
  telHref: string | null
  mailto: string | null
  /** El número que se muestra en pantalla, sin normalizar. */
  phoneLabel: string
}

/**
 * Los canales por los que se le puede escribir a un complejo, resueltos en un
 * solo lugar.
 *
 * La cascada es `whatsapp ?? phone`: `tenants.whatsapp` es opcional y en la
 * práctica casi nunca está cargado (hasta hoy no había ninguna pantalla para
 * cargarlo), mientras que `tenants.phone` es NOT NULL. Caer al teléfono es lo
 * que hace que el botón de WhatsApp exista para la mayoría de los complejos.
 *
 * Existe porque la misma decisión se toma en tres lugares con públicos
 * distintos — el perfil público, la pantalla del jugador que espera una
 * devolución y la lista de devoluciones del complejo — y tienen que ofrecer el
 * mismo canal. Antes cada uno armaba el link a mano.
 *
 * @param message se pre-carga en el chat de WhatsApp. Sin él, abre vacío.
 */
export function resolveTenantContact(tenant: TenantContactSource, message?: string): TenantContact {
  const preferred = tenant.whatsapp?.trim() ? tenant.whatsapp : tenant.phone
  return {
    whatsappUrl: buildWhatsappUrl(preferred, message),
    telHref: telHref(tenant.phone),
    mailto: tenant.email ? `mailto:${tenant.email}` : null,
    phoneLabel: tenant.phone,
  }
}
