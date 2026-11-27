import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'
import { appLink } from './app-link'

export type TrialExpiredData = {
  ownerName: string
  tenantName: string
}

/**
 * Terminó la prueba sin pago y `runExpireTrials` pasó el complejo a
 * `trial_expired` (docs/decisions/2026-11-27-prueba-30-dias-y-precios.md). No se
 * borra nada: la ficha sigue visible sin horarios, el panel queda en solo
 * lectura y los turnos ya confirmados se pueden operar.
 */
export function renderTrialExpired(data: TrialExpiredData): EmailContent {
  const subject = `Terminó tu prueba. ${data.tenantName} sigue en TurnoGol`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2>Terminó tu prueba</h2>
  <p>Hola ${escapeHtml(data.ownerName)},</p>
  <p>Se terminó la prueba de <strong>${escapeHtml(data.tenantName)}</strong>. Tus datos y los turnos ya confirmados siguen intactos.</p>
  <p>Hasta que actives el plan, tu ficha se ve sin horarios, no se pueden reservar turnos online y el panel queda en solo lectura. Los turnos que ya tenés los podés cobrar, dar por jugados o cancelar.</p>
  <p style="text-align:center;margin:24px 0">
    <a href="${appLink('/reactivar')}" style="background:#0369a1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Activar el plan</a>
  </p>
  <p style="color:#64748b;font-size:14px">El equipo de TurnoGol</p>
</body>
</html>`
  const text = `Terminó tu prueba\n\nHola ${data.ownerName},\n\nSe terminó la prueba de ${data.tenantName}. Tus datos y los turnos ya confirmados siguen intactos.\n\nHasta que actives el plan, tu ficha se ve sin horarios, no se pueden reservar turnos online y el panel queda en solo lectura. Los turnos que ya tenés los podés cobrar, dar por jugados o cancelar. Activá el plan en ${appLink('/reactivar')}\n\nEl equipo de TurnoGol`
  return { subject, html, text }
}
