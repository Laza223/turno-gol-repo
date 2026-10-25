import type { EmailContent } from './index'
import { renderRivalMail } from './rival-layout'

export type RivalAcceptedData = {
  tenantName: string
  dateLabel: string
  url: string
}

export function renderRivalAccepted(data: RivalAcceptedData): EmailContent {
  return renderRivalMail({
    subject: `Te aceptaron en el partido de ${data.tenantName}`,
    title: '¡Te aceptaron!',
    lines: [
      'El organizador te aceptó en el partido. Entrá para escribirle y coordinar los detalles.',
    ],
    tenantName: data.tenantName,
    dateLabel: data.dateLabel,
    cta: 'Ver el partido',
    url: data.url,
  })
}
