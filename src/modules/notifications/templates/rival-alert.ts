import type { EmailContent } from './index'
import { renderRivalMail } from './rival-layout'

export type RivalAlertData = {
  tenantName: string
  dateLabel: string
  url: string
  /** Link firmado `/rival/baja?t=…`: la baja es de un toque y sin login. */
  unsubscribeUrl: string
}

export function renderRivalAlert(data: RivalAlertData): EmailContent {
  return renderRivalMail({
    subject: `Hay un partido en ${data.tenantName} que busca gente`,
    title: 'Hay partido en tu complejo',
    lines: ['Pediste que te avisemos y hay un partido nuevo con lugar.'],
    tenantName: data.tenantName,
    dateLabel: data.dateLabel,
    cta: 'Ver el partido',
    url: data.url,
    footer: {
      text: 'Te llega porque pediste avisos de este complejo.',
      linkLabel: 'Dejar de recibirlos',
      url: data.unsubscribeUrl,
    },
  })
}
