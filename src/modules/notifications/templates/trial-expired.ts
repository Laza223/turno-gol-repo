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
 * No se bloquea: sigue anotando sus turnos y recibiendo reservas online (freemium
 * v2, docs/decisions/2026-11-15-freemium-corte-v2.md), y pierde la plata, los fijos
 * y el equipo. Lo cargado queda guardado (no hay borrado agendado).
 */
export function renderTrialExpired(data: TrialExpiredData): EmailContent {
  const subject = `Terminó tu prueba. ${data.tenantName} sigue en TurnoGol gratis`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2>Terminó tu prueba</h2>
  <p>Hola ${escapeHtml(data.ownerName)},</p>
  <p><strong>${escapeHtml(data.tenantName)}</strong> pasó al plan gratis. Seguís anotando tus turnos y tus jugadores te siguen encontrando y reservando online.</p>
  <p>Desde hoy no tenés los cobros, la caja, los fijos que se cargan solos ni tu encargado. Todo lo que cargaste quedó guardado y vuelve apenas actives el plan.</p>
  <p style="text-align:center;margin:24px 0">
    <a href="${appLink('/reactivar')}" style="background:#0369a1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Activar el plan</a>
  </p>
  <p style="color:#64748b;font-size:14px">El equipo de TurnoGol</p>
</body>
</html>`
  const text = `Terminó tu prueba\n\nHola ${data.ownerName},\n\n${data.tenantName} pasó al plan gratis. Seguís anotando tus turnos y tus jugadores te siguen reservando online.\n\nDesde hoy no tenés los cobros, la caja, los fijos que se cargan solos ni tu encargado. Todo quedó guardado. Activá el plan en ${appLink('/reactivar')}\n\nEl equipo de TurnoGol`
  return { subject, html, text }
}
