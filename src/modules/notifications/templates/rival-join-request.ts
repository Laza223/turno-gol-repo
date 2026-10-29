import type { EmailContent } from './index'
import { renderRivalMail } from './rival-layout'

export type RivalJoinRequestData = {
  /** Nombre de pila de quien pide sumarse (nunca el nombre completo ni el contacto). */
  requesterFirstName: string
  /**
   * `captain` = el partido busca rival y quien pide trae un equipo. Opcional con default `player`:
   * las notificaciones ya encoladas antes de este campo siguen saliendo como mail de jugador.
   */
  requesterRole?: 'player' | 'captain'
  tenantName: string
  dateLabel: string
  url: string
}

export function renderRivalJoinRequest(data: RivalJoinRequestData): EmailContent {
  if (data.requesterRole === 'captain') {
    return renderRivalMail({
      subject: `${data.requesterFirstName} quiere jugarle a tu equipo`,
      title: `${data.requesterFirstName} trae un equipo para jugarte`,
      lines: [
        `${data.requesterFirstName} es capitán de un equipo y quiere jugar contra el tuyo. Entrá y decidí si aceptás el desafío.`,
      ],
      tenantName: data.tenantName,
      dateLabel: data.dateLabel,
      cta: 'Ver el desafío',
      url: data.url,
    })
  }
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
