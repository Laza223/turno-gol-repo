import type { EmailContent } from './index'
import { renderRivalMail } from './rival-layout'

export type RivalJoinRequestData = {
  /** Nombre de pila de quien pide sumarse (nunca el nombre completo ni el contacto). */
  requesterFirstName: string
  tenantName: string
  dateLabel: string
  url: string
}

export function renderRivalJoinRequest(data: RivalJoinRequestData): EmailContent {
  return renderRivalMail({
    subject: `${data.requesterFirstName} quiere sumarse a tu partido`,
    title: 'Alguien quiere sumarse',
    lines: [
      `${data.requesterFirstName} pidió un lugar en tu partido. Entrá y decidí si lo aceptás.`,
    ],
    tenantName: data.tenantName,
    dateLabel: data.dateLabel,
    cta: 'Ver el pedido',
    url: data.url,
  })
}
