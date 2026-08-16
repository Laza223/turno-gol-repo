import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'

export type OnboardingAbandonedData = {
  ownerName: string
  tenantName: string
  /** Label del último paso completado (WIZARD_STEPS[n].label), no el número — "Horarios", no "2". */
  lastStepLabel: string
}

export function renderOnboardingAbandoned(data: OnboardingAbandonedData): EmailContent {
  const subject = `Te faltó un paso para terminar de configurar ${data.tenantName} — TurnoGol`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#0369a1">Te quedaste a mitad de camino</h2>
  <p>Hola ${escapeHtml(data.ownerName)},</p>
  <p>Empezaste a configurar <strong>${escapeHtml(data.tenantName)}</strong> en TurnoGol y quedó en el paso <strong>"${escapeHtml(data.lastStepLabel)}"</strong>. Te faltan menos de 5 minutos para terminar y que tus jugadores ya puedan reservar online.</p>
  <p style="text-align:center;margin:24px 0">
    <a href="https://app.turnogol.app/onboarding" style="background:#0369a1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Terminar de configurar →</a>
  </p>
  <p style="color:#64748b;font-size:14px">Si ya terminaste o cambiaste de idea, ignorá este mensaje.</p>
  <p style="color:#64748b;font-size:14px">— El equipo de TurnoGol</p>
</body>
</html>`
  const text = `Te quedaste a mitad de camino\n\nHola ${data.ownerName},\n\nEmpezaste a configurar ${data.tenantName} en TurnoGol y quedó en el paso "${data.lastStepLabel}". Te faltan menos de 5 minutos para terminar.\n\nTerminá acá: https://app.turnogol.app/onboarding\n\n— El equipo de TurnoGol`
  return { subject, html, text }
}
