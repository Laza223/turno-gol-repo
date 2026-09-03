import type { EmailContent } from './index'
import { escapeHtml } from './html-escape'

export type TrialWelcomeData = {
  ownerName: string
  tenantName: string
  /**
   * Días de prueba, SOLO cuando el alta los fija explícitamente (alta asistida
   * del super-admin para un piloto). El self-signup lo omite A PROPÓSITO: su
   * trial nace de 30 días y a los pilotos se les extiende DESPUÉS desde
   * soporte, cuando este mail ya salió. Decir un número que va a dejar de ser
   * cierto en horas es peor que no decirlo — el copy anterior tenía "30 días"
   * fijo y le contradecía al primer piloto lo que se le había prometido.
   * Ausente, cero o negativo caen todos en la frase sin número.
   */
  trialDays?: number
}

export function renderTrialWelcome(data: TrialWelcomeData): EmailContent {
  const subject = `Bienvenido a TurnoGol — ${data.tenantName}`

  // `content` llega del JSONB de `notifications`, así que el tipo de arriba no
  // garantiza nada en runtime: las filas encoladas antes de este cambio no
  // tienen la clave. Sin esta guarda renderizaban "undefined días".
  const days = typeof data.trialDays === 'number' && data.trialDays > 0 ? data.trialDays : null
  const trialHtml =
    days === null
      ? 'Tu prueba gratuita ya está activa: podés ver hasta cuándo va en Configuración → Facturación.'
      : `Tenés ${days === 1 ? '1 día' : `${days} días`} de prueba gratuita para explorar todas las funcionalidades.`
  const trialText =
    days === null
      ? 'Tu prueba gratuita ya está activa: podés ver hasta cuándo va en Configuración → Facturación.'
      : `Tenés ${days === 1 ? '1 día' : `${days} días`} de prueba gratuita.`

  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#0369a1">¡Bienvenido a TurnoGol!</h2>
  <p>Hola ${escapeHtml(data.ownerName)},</p>
  <p>Tu complejo <strong>${escapeHtml(data.tenantName)}</strong> ya está activo en TurnoGol. ${trialHtml}</p>
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
  const text = `¡Bienvenido a TurnoGol!\n\nHola ${data.ownerName},\n\nTu complejo ${data.tenantName} ya está activo. ${trialText}\n\nEmpezá por:\n1. Configurar tus canchas y precios\n2. Conectar tu cuenta de MercadoPago\n3. Compartir tu link de reservas\n\n— El equipo de TurnoGol`
  return { subject, html, text }
}
