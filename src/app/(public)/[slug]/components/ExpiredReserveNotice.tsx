import './ficha.css'
import { buttonVariants } from '@/components/ui/button'
import { resolveTenantContact } from '@/lib/tenant-contact'
import { cn } from '@/lib/utils'
import type { PublicTenant } from '@/modules/tenants/public.service'
import ContactLink from './ContactLink'

const TITLE_ID = 'reserva-titulo'
const LINK = cn(buttonVariants({ variant: 'pill-link', size: 'pill-sm' }), 'w-full sm:w-auto')

/**
 * Lo que la ficha muestra en lugar de la reserva cuando el complejo está en `trial_expired`:
 * sin horarios ni grilla, con el contacto directo (docs/decisions/2026-11-27-prueba-30-dias-y-precios.md).
 * Los enlaces avisan el clic para que soporte pueda recuperar al complejo.
 */
export default function ExpiredReserveNotice({
  tenant,
  trackContact,
}: {
  tenant: Pick<PublicTenant, 'name' | 'whatsapp' | 'phone'>
  trackContact: (channel: 'whatsapp' | 'phone') => Promise<void>
}) {
  const contact = resolveTenantContact(
    tenant,
    `Hola! Quería consultar horarios disponibles en ${tenant.name}.`,
  )
  return (
    <section
      data-reserve-section
      data-state="expired"
      aria-labelledby={TITLE_ID}
      className="reserve glass"
    >
      <div>
        <h2
          id={TITLE_ID}
          className="text-[26px] leading-[1.1] font-bold tracking-[-0.03em] text-portal-ink"
        >
          Reservas online no disponibles en este momento
        </h2>
        <p className="mt-1.5 text-[15px] leading-[1.4] text-pretty text-portal-soft">
          Escribile directo al complejo para consultar horarios.
        </p>
      </div>
      {contact.whatsappUrl ? (
        <ContactLink
          href={contact.whatsappUrl}
          channel="whatsapp"
          onTrack={trackContact}
          className={LINK}
        >
          Consultar por WhatsApp
        </ContactLink>
      ) : contact.telHref ? (
        <ContactLink href={contact.telHref} channel="phone" onTrack={trackContact} className={LINK}>
          Llamar al complejo
        </ContactLink>
      ) : null}
    </section>
  )
}
