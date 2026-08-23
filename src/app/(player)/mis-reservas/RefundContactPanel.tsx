'use client'

import { MessageCircle, Phone, Mail } from 'lucide-react'
import { formatArs } from '@/lib/format'
import { resolveTenantContact } from '@/lib/tenant-contact'
import type { RefundContactInfo } from './actions'

/**
 * Los canales para reclamar la devolución de una seña, con el mensaje ya
 * escrito.
 *
 * Por qué existe: el reembolso automático de MercadoPago falla siempre (403 —
 * MercadoPago deriva los permisos del producto de la aplicación y ninguno
 * concede el de reembolsos), así que la devolución la hace el complejo. Antes
 * de esto, el jugador cancelaba, veía la tarjeta cambiar de color, y no se le
 * decía ni cuánto le tenían que devolver ni a quién escribirle — los mensajes
 * de error decían literalmente "contactá al complejo" sin dar ningún contacto.
 *
 * Se usa en dos lugares a propósito: en el diálogo que aparece apenas se
 * cancela, y en la tarjeta de la reserva mientras la devolución siga pendiente.
 * El diálogo se cierra y se pierde; la tarjeta es la que sigue estando ahí
 * mañana.
 */
export function RefundContactPanel({ refund }: { refund: RefundContactInfo }) {
  const message =
    `Hola ${refund.tenantName}, cancelé mi reserva ${refund.bookingCode} ` +
    `del ${refund.dateLabel} a las ${refund.timeLabel}. ` +
    `Quería coordinar la devolución de la seña de ${formatArs(refund.amountCents)}. ¡Gracias!`

  const contact = resolveTenantContact(
    {
      whatsapp: refund.tenantWhatsapp,
      phone: refund.tenantPhone,
      email: refund.tenantEmail,
    },
    message,
  )

  const linkClass =
    'inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-[color,background-color,scale] active:scale-[0.98]'

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {refund.state === 'settled' ? (
          <>
            MercadoPago ya procesó la devolución de{' '}
            <strong className="text-foreground">{formatArs(refund.amountCents)}</strong>. Puede
            tardar unos días hábiles en aparecer en tu cuenta.
          </>
        ) : (
          <>
            <strong className="text-foreground">{refund.tenantName}</strong> te tiene que devolver{' '}
            <strong className="text-foreground">{formatArs(refund.amountCents)}</strong>. Escribiles
            para coordinar cómo.
          </>
        )}
      </p>

      <p className="text-xs text-muted-foreground">
        Código de tu reserva: <span className="font-mono font-semibold">{refund.bookingCode}</span>
      </p>

      <div className="flex flex-wrap gap-2">
        {/* Sin número marcable no se ofrece el botón: un wa.me roto hace que el
            jugador crea que escribió cuando nadie recibió nada. Siempre queda
            el email, que es NOT NULL en la base. */}
        {contact.whatsappUrl && (
          <a
            href={contact.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            // Verde claro con texto verde oscuro, no verde sólido con texto
            // blanco: en Tailwind 4 (OKLCH) green-600/700 sobre blanco cae por
            // debajo del contraste AA y axe lo marca. Mismo par que ya usa el
            // chip de WhatsApp del perfil público.
            className={`${linkClass} border border-green-300 bg-green-50 text-green-800 hover:bg-green-100 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300`}
          >
            <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
            Escribir por WhatsApp
          </a>
        )}
        {contact.telHref && (
          <a
            href={contact.telHref}
            className={`${linkClass} border border-border text-foreground hover:bg-muted`}
          >
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            {contact.phoneLabel}
          </a>
        )}
        {contact.mailto && (
          <a
            href={contact.mailto}
            className={`${linkClass} border border-border text-foreground hover:bg-muted`}
          >
            <Mail className="h-4 w-4 shrink-0" aria-hidden />
            Email
          </a>
        )}
      </div>
    </div>
  )
}
