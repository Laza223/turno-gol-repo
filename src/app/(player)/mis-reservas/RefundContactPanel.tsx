'use client'

import { MessageCircle, Phone, Mail } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { resolveTenantContact } from '@/lib/tenant-contact'
import type { RefundContactInfo } from './actions'

/** Cómo se nombra el medio en una frase, en criollo. */
const METHOD_LABEL: Record<string, string> = {
  mercadopago: 'por Mercado Pago',
  cash: 'en efectivo',
  transfer: 'por transferencia',
  other: 'por otro medio',
}

/**
 * "el 24/08", o cadena vacía si la fila no tiene `processed_at`.
 *
 * Se pasa por `en-CA` (que da "YYYY-MM-DD") y se da vuelta a mano en vez de
 * pedir `es-AR` con `2-digit`: ese locale devuelve "24/8", con el mes sin
 * cero, y el resto de las fechas de esta pantalla —las del turno— vienen del
 * `slice` de la fecha ISO, o sea "29/08". Dos formatos en el mismo párrafo se
 * leen como un error.
 */
function settledOnLabel(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const [, month, day] = d
    .toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    .split('-')
  return ` el ${day}/${month}`
}

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
  const settled = refund.state === 'settled'
  // Ya saldada, el jugador escribe por una razón distinta: no le llegó. El
  // mensaje no puede seguir pidiendo "coordinar" algo que el complejo ya dio
  // por hecho, o la conversación arranca desencontrada.
  const message = settled
    ? `Hola ${refund.tenantName}, te escribo por la devolución de la seña de ` +
      `${formatArs(refund.amountCents)} de mi reserva ${refund.bookingCode} ` +
      `del ${refund.dateLabel} a las ${refund.timeLabel}. ¡Gracias!`
    : `Hola ${refund.tenantName}, cancelé mi reserva ${refund.bookingCode} ` +
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

  // Los tres canales son del mismo peso: píldoras interiores de 44 px.
  const outlineClass = cn(buttonVariants({ variant: 'pill-link', size: 'pill-sm' }), 'min-h-11')

  return (
    <div className="space-y-3">
      <p className="text-sm text-portal-muted">
        {settled ? (
          refund.settledMethod === 'mercadopago' ? (
            <>
              Mercado Pago ya procesó la devolución de{' '}
              <strong className="text-portal-ink">{formatArs(refund.amountCents)}</strong>. Puede
              tardar unos días hábiles en aparecer en tu cuenta.
            </>
          ) : (
            <>
              <strong className="text-portal-ink">{refund.tenantName}</strong> marcó que te devolvió{' '}
              <strong className="text-portal-ink">{formatArs(refund.amountCents)}</strong>
              {refund.settledMethod ? ` ${METHOD_LABEL[refund.settledMethod]}` : ''}
              {settledOnLabel(refund.settledAt)}. Si no te llegó, escribiles.
            </>
          )
        ) : (
          <>
            <strong className="text-portal-ink">{refund.tenantName}</strong> te tiene que devolver{' '}
            <strong className="text-portal-ink">{formatArs(refund.amountCents)}</strong>. Escribiles
            para coordinar cómo.
          </>
        )}
      </p>

      <p className="text-sm text-portal-muted">
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
            className={outlineClass}
          >
            <MessageCircle aria-hidden />
            Escribir por WhatsApp
          </a>
        )}
        {contact.telHref && (
          <a href={contact.telHref} className={outlineClass}>
            <Phone aria-hidden />
            {contact.phoneLabel}
          </a>
        )}
        {contact.mailto && (
          <a href={contact.mailto} className={outlineClass}>
            <Mail aria-hidden />
            Email
          </a>
        )}
      </div>
    </div>
  )
}
