import type { EmailContent } from './index'
import { renderRivalMail } from './rival-layout'

export type RivalCanceledData = {
  tenantName: string
  dateLabel: string
  url: string
}

export function renderRivalCanceled(data: RivalCanceledData): EmailContent {
  return renderRivalMail({
    subject: `Se canceló el partido en ${data.tenantName}`,
    title: 'Se canceló el partido',
    lines: [
      'El organizador canceló el partido en el que estabas anotado.',
      'Si querés jugar igual, en el tablón hay otros partidos abiertos.',
    ],
    tenantName: data.tenantName,
    dateLabel: data.dateLabel,
    cta: 'Ver partidos abiertos',
    url: data.url,
  })
}
