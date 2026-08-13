import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'

export type TrialWelcomeData = {
  ownerName: string
  tenantName: string
}

export function renderTrialWelcome(data: TrialWelcomeData): EmailContent {
  const subject = `Bienvenido a TurnoGol — ${data.tenantName}`
  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#0369a1">¡Bienvenido a TurnoGol!</h2>
  <p>Hola ${escapeHtml(data.ownerName)},</p>
  <p>Tu complejo <strong>${escapeHtml(data.tenantName)}</strong> ya está activo en TurnoGol. Tenés 30 días de prueba gratuita para explorar todas las funcionalidades.</p>
  <p>Te recomendamos empezar por:</p>
  <ol>
    <li>Configurar tus canchas y precios</li>
    <li>Conectar tu cuenta de MercadoPago para recibir señas</li>
    <li>Compartir tu link de reservas con tus jugadores</li>
  </ol>
  <p style="color:#64748b;font-size:14px">Si tenés dudas, respondé este mail y te ayudamos.</p>
  <p style="color:#64748b;font-size:14px">— El equipo de TurnoGol</p>
</body>
</html>`
  const text = `¡Bienvenido a TurnoGol!\n\nHola ${data.ownerName},\n\nTu complejo ${data.tenantName} ya está activo. Tenés 30 días de prueba gratuita.\n\nEmpezá por:\n1. Configurar tus canchas y precios\n2. Conectar tu cuenta de MercadoPago\n3. Compartir tu link de reservas\n\n— El equipo de TurnoGol`
  return { subject, html, text }
}
