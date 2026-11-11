import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'
import { appLink } from './app-link'

export type PlanDowngradedFreeData = {
  ownerName: string
  tenantName: string
  /** Por qué bajó: terminó la mora o venció lo que pagó antes de darse de baja. */
  reason: 'dunning' | 'canceled'
}

/**
 * El complejo dejó de pagar y bajó al plan gratis (freemium,
 * docs/decisions/2026-11-08-freemium-spec-y-estado-free.md). Reemplaza al viejo
 * "cuenta bloqueada": ya nadie se bloquea por falta de pago. Sigue en TurnoGol
 * y sus jugadores lo siguen encontrando; lo que pierde es anotar la noche.
 */
export function renderPlanDowngradedFree(data: PlanDowngradedFreeData): EmailContent {
  const why =
    data.reason === 'dunning'
      ? 'Pasaron 14 días sin que se pudiera cobrar el plan.'
      : 'Terminó el período que habías pagado.'
  const subject = `${data.tenantName} pasó al plan gratis`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2>${escapeHtml(data.tenantName)} pasó al plan gratis</h2>
  <p>Hola ${escapeHtml(data.ownerName)},</p>
  <p>${why} Tu complejo sigue en TurnoGol y tus jugadores te siguen encontrando y reservando online, hasta 20 turnos por mes.</p>
  <p>Anotar tus turnos, los fijos, la caja y tus jugadores es con el plan. Todo lo que cargaste quedó guardado y vuelve apenas lo actives.</p>
  <p style="text-align:center;margin:24px 0">
    <a href="${appLink('/reactivar')}" style="background:#0369a1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Activar el plan</a>
  </p>
  <p style="color:#64748b;font-size:14px">El equipo de TurnoGol</p>
</body>
</html>`
  const text = `${data.tenantName} pasó al plan gratis\n\nHola ${data.ownerName},\n\n${why} Tu complejo sigue en TurnoGol y tus jugadores te siguen reservando online, hasta 20 turnos por mes.\n\nAnotar tus turnos, los fijos, la caja y tus jugadores es con el plan. Todo lo que cargaste quedó guardado. Activalo en ${appLink('/reactivar')}\n\nEl equipo de TurnoGol`
  return { subject, html, text }
}
