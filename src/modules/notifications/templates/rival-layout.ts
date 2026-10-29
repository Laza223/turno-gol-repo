import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'

/**
 * Cuerpo común de los mails de RIVAL: título, un párrafo, un botón al link de la app y un pie
 * opcional (la baja de las alertas). Ningún mail de RIVAL lleva teléfono, email ni nombre
 * completo de terceros: lo que se pasa acá ya viene sin eso. `title`/`lines` van en texto plano;
 * se escapan al armar el html.
 */
export function renderRivalMail(args: {
  subject: string
  title: string
  lines: string[]
  tenantName: string
  dateLabel: string
  cta: string
  url: string
  footer?: { text: string; linkLabel: string; url: string }
}): EmailContent {
  const { subject, title, lines, tenantName, dateLabel, cta, url, footer } = args
  const paragraphs = lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('\n  ')
  const footerHtml = footer
    ? `<p style="color:#64748b;font-size:13px">${escapeHtml(footer.text)} <a href="${escapeHtml(footer.url)}" style="color:#64748b">${escapeHtml(footer.linkLabel)}</a></p>`
    : ''
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2>${escapeHtml(title)}</h2>
  ${paragraphs}
  <p><strong>${escapeHtml(tenantName)}</strong><br>${escapeHtml(dateLabel)}</p>
  <p><a href="${escapeHtml(url)}" style="display:inline-block;background:#047857;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(cta)}</a></p>
  <p style="color:#64748b;font-size:14px">${escapeHtml(url)}</p>
  ${footerHtml}
  <p style="color:#64748b;font-size:14px">— RIVAL, de TurnoGol</p>
</body>
</html>`
  const text = [
    title,
    '',
    ...lines,
    '',
    `${tenantName} · ${dateLabel}`,
    `${cta}: ${url}`,
    ...(footer ? ['', `${footer.text} ${footer.linkLabel}: ${footer.url}`] : []),
    '',
    '— RIVAL, de TurnoGol',
  ].join('\n')
  return { subject, html, text }
}
