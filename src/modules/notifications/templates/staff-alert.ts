import type { EmailContent } from './index'
import { appLink } from './app-link'
import { escapeHtml } from './html-escape'

export type StaffAlertData = { title: string; body: string; url: string }

export function renderStaffAlert(data: StaffAlertData): EmailContent {
  const url = appLink(
    data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/dashboard',
  )
  return {
    subject: data.title,
    html: `<html lang="es"><body><h2>${escapeHtml(data.title)}</h2><p>${escapeHtml(data.body)}</p><p><a href="${escapeHtml(url)}">Abrir TurnoGol</a></p></body></html>`,
    text: `${data.title}\n\n${data.body}\n\nAbrir TurnoGol: ${url}`,
  }
}
