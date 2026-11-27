import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'
import { appLink } from './app-link'

export type PlanNotActiveData = {
  ownerName: string
  tenantName: string
  /** Por qué se cortó: terminó la mora o venció lo que pagó antes de darse de baja. */
  reason: 'dunning' | 'canceled'
}

/**
 * El complejo dejó de pagar y pasó a `trial_expired`
 * (docs/decisions/2026-11-27-prueba-30-dias-y-precios.md). Reemplaza al viejo
 * "pasó al plan gratis". Sus datos y los turnos confirmados siguen; la ficha
 * pública queda sin horarios y el panel en solo lectura.
 */
export function renderPlanNotActive(data: PlanNotActiveData): EmailContent {
  const why =
    data.reason === 'dunning'
      ? 'Pasaron 14 días sin que se pudiera cobrar el plan.'
      : 'Terminó el período que habías pagado.'
  const subject = `El plan de ${data.tenantName} no está activo`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2>El plan de ${escapeHtml(data.tenantName)} no está activo</h2>
  <p>Hola ${escapeHtml(data.ownerName)},</p>
  <p>${why} Tus datos y los turnos ya confirmados siguen intactos. Podés cobrarlos, darlos por jugados o cancelarlos como siempre.</p>
  <p>Mientras el plan no esté activo, la ficha de tu complejo se ve sin horarios, no se pueden reservar turnos online y el panel queda en solo lectura. Todo vuelve apenas lo actives.</p>
  <p style="text-align:center;margin:24px 0">
    <a href="${appLink('/reactivar')}" style="background:#0369a1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Activar el plan</a>
  </p>
  <p style="color:#64748b;font-size:14px">El equipo de TurnoGol</p>
</body>
</html>`
  const text = `El plan de ${data.tenantName} no está activo\n\nHola ${data.ownerName},\n\n${why} Tus datos y los turnos ya confirmados siguen intactos. Podés cobrarlos, darlos por jugados o cancelarlos como siempre.\n\nMientras el plan no esté activo, la ficha de tu complejo se ve sin horarios, no se pueden reservar turnos online y el panel queda en solo lectura. Todo vuelve apenas lo actives en ${appLink('/reactivar')}\n\nEl equipo de TurnoGol`
  return { subject, html, text }
}
