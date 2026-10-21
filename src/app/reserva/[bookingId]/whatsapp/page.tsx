import type { Metadata } from 'next'
import { MessageCircle } from 'lucide-react'
import { PortalResult } from '@/components/world/PortalResult'

export const metadata: Metadata = {
  title: 'Volvé a WhatsApp',
  robots: { index: false, follow: false },
}

/**
 * A dónde vuelve MercadoPago cuando la seña se pagó desde el link que mandó el
 * bot de WhatsApp. Las hermanas `exito`/`pendiente`/`error` exigen sesión de
 * jugador y quien reservó por WhatsApp no la tiene. Esta no lee nada: el
 * resultado del pago se le confirma en el chat (webhook de MP → aviso por
 * WhatsApp), así que acá no hay estado que mostrar ni datos que proteger.
 * Una sola página para los tres retornos: el texto vale para cualquiera.
 */
export default function ReservaWhatsappPage() {
  return (
    <PortalResult icon={MessageCircle} title="Volvé a WhatsApp">
      <p>Cuando se acredite el pago, te confirmamos el turno en el mismo chat.</p>
      <p>Si el pago no salió, escribinos ahí y lo resolvemos.</p>
    </PortalResult>
  )
}
