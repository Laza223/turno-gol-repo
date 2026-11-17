import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'
import { appLink } from './app-link'

export type TrialEndingData = {
  ownerName: string
  tenantName: string
  daysLeft: number
}

export function renderTrialEnding(data: TrialEndingData): EmailContent {
  const subject = `Te queda${data.daysLeft === 1 ? '' : 'n'} ${data.daysLeft} día${data.daysLeft === 1 ? '' : 's'} de prueba del plan Completo`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#d97706">Tu prueba del plan Completo está por terminar</h2>
  <p>Hola ${escapeHtml(data.ownerName)},</p>
  <p>La prueba del plan Completo de <strong>${escapeHtml(data.tenantName)}</strong> termina en <strong>${data.daysLeft} día${data.daysLeft === 1 ? '' : 's'}</strong>.</p>
  <p>Si no activás el plan, el complejo pasa al plan gratis. Seguís anotando tus turnos y tus jugadores te siguen reservando online, pero dejás de tener los cobros, la caja, los fijos que se cargan solos y tu encargado.</p>
  <p style="text-align:center;margin:24px 0">
    <a href="${appLink('/settings/facturacion')}" style="background:#0369a1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Activar suscripción →</a>
  </p>
  <p style="color:#64748b;font-size:14px">Si ya activaste tu suscripción, ignorá este mensaje.</p>
  <p style="color:#64748b;font-size:14px">— El equipo de TurnoGol</p>
</body>
</html>`
  const text = `Tu prueba del plan Completo está por terminar\n\nHola ${data.ownerName},\n\nLa prueba del plan Completo de ${data.tenantName} termina en ${data.daysLeft} día${data.daysLeft === 1 ? '' : 's'}.\n\nSi no activás el plan, pasás al plan gratis. Seguís anotando tus turnos, pero dejás de tener los cobros, la caja, los fijos que se cargan solos y tu encargado. Activalo en: ${appLink('/settings/facturacion')}\n\n— El equipo de TurnoGol`
  return { subject, html, text }
}
