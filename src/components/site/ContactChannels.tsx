import { Mail } from 'lucide-react'
import { InstagramIcon } from '@/components/icons/InstagramIcon'
import { WhatsappIcon } from '@/components/icons/WhatsappIcon'
import {
  CONTACT_EMAIL,
  CONTACT_INSTAGRAM_HANDLE,
  CONTACT_WHATSAPP_DISPLAY,
  contactInstagramUrl,
  contactMailtoUrl,
  contactWhatsappUrl,
} from '@/lib/contact'

/**
 * Los canales de contacto de TurnoGol, para los dos pies de página.
 *
 * Reemplaza al link "Contacto" suelto que los dos tenían: era un `mailto:` y
 * nada más, con el agravante de que en una computadora sin cliente de correo
 * configurado no hace absolutamente nada. El WhatsApp de la empresa ya existía
 * en el código (`src/lib/contact.ts`) pero su único consumidor real lo mostraba
 * sólo cuando la cuenta estaba suspendida.
 *
 * Íconos y no texto: la fila ya tiene cinco links y en 375 px tres palabras más
 * la parten en tres renglones. El nombre accesible va en `aria-label` y además
 * en `title`, así el lector de pantalla y el mouse dicen lo mismo — incluido el
 * número y el usuario, que es lo que alguien puede querer anotar sin hacer clic.
 *
 * `linkClassName` lo pone cada pie de página porque los dos viven en climas
 * distintos (el del portal sigue el tema; el comercial es oscuro fijo sobre
 * `#020617`), y el contraste ya está calibrado en cada archivo.
 */
export function ContactChannels({ linkClassName }: { linkClassName: string }) {
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label="Contacto">
      <a
        href={contactWhatsappUrl()}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`WhatsApp ${CONTACT_WHATSAPP_DISPLAY}`}
        title={`WhatsApp ${CONTACT_WHATSAPP_DISPLAY}`}
        className={linkClassName}
      >
        <WhatsappIcon className="h-4 w-4" />
      </a>
      <a
        href={contactInstagramUrl()}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Instagram @${CONTACT_INSTAGRAM_HANDLE}`}
        title={`Instagram @${CONTACT_INSTAGRAM_HANDLE}`}
        className={linkClassName}
      >
        <InstagramIcon className="h-4 w-4" />
      </a>
      <a
        href={contactMailtoUrl()}
        aria-label={`Mail ${CONTACT_EMAIL}`}
        title={`Mail ${CONTACT_EMAIL}`}
        className={linkClassName}
      >
        <Mail aria-hidden className="h-4 w-4" />
      </a>
    </span>
  )
}
