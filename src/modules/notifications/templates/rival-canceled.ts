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
    lines: ['El organizador canceló el partido.', 'Mirá en RIVAL si hay otro partido abierto.'],
    tenantName: data.tenantName,
    dateLabel: data.dateLabel,
    cta: 'Ver partidos abiertos',
    url: data.url,
  })
}
