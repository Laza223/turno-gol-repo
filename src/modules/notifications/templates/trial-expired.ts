import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'
import { appLink } from './app-link'

export type TrialExpiredData = {
  ownerName: string
  tenantName: string
}

/**
 * Día 31: terminó la prueba sin pago y `runExpireTrials` pasó el complejo al
 * plan gratis (freemium, docs/decisions/2026-11-08-freemium-spec-y-estado-free.md).
 * No se bloquea: sigue en el mapa con hasta 20 reservas online por mes y deja de
 * poder anotar la noche. Lo cargado queda guardado (no hay borrado agendado).
 */
export function renderTrialExpired(data: TrialExpiredData): EmailContent {
  const subject = `Terminó tu prueba. ${data.tenantName} sigue en TurnoGol gratis`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2>Terminó tu prueba</h2>
  <p>Hola ${escapeHtml(data.ownerName)},</p>
  <p><strong>${escapeHtml(data.tenantName)}</strong> pasó al plan gratis. Tus jugadores te siguen encontrando y reservando online, hasta 20 turnos por mes.</p>
  <p>Desde hoy no podés anotar tus turnos, los fijos, la caja ni tus jugadores. Todo lo que cargaste quedó guardado y vuelve apenas actives el plan.</p>
  <p style="text-align:center;margin:24px 0">
    <a href="${appLink('/reactivar')}" style="background:#0369a1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Activar el plan</a>
  </p>
  <p style="color:#64748b;font-size:14px">El equipo de TurnoGol</p>
</body>
</html>`
  const text = `Terminó tu prueba\n\nHola ${data.ownerName},\n\n${data.tenantName} pasó al plan gratis. Tus jugadores te siguen reservando online, hasta 20 turnos por mes.\n\nDesde hoy no podés anotar tus turnos, los fijos, la caja ni tus jugadores. Todo quedó guardado. Activá el plan en ${appLink('/reactivar')}\n\nEl equipo de TurnoGol`
  return { subject, html, text }
}
