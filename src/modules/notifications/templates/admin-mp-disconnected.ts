import type { EmailContent } from './index'

export type AdminMpDisconnectedData = {
  /** Nombre del complejo, para que el asunto diga cuál cuando el dueño tiene más de uno. */
  tenantName: string
}

/**
 * Admin alert: el complejo revocó, DESDE EL PANEL DE MERCADOPAGO, el permiso
 * que le había dado a TurnoGol para cobrar en su nombre. MercadoPago lo avisa
 * con `application.deauthorized` y TurnoGol limpia las credenciales.
 *
 * Va SOLO al rol `admin` (`onlyRole: 'admin'` en el emisor): es plata y MP, el
 * mismo criterio con el que `requireAdminStaffAction` le cierra Configuración y
 * facturación al encargado — y es idéntico al de
 * `admin-external-refund-detected`, el otro aviso de "esto pasó en el panel de
 * MercadoPago, no en la app".
 *
 * Lo que hace urgente el mail es lo que el sistema apagó solo: desvincular
 * apaga `requires_deposit` (`disconnectMercadoPago`), así que a partir de ahora
 * los turnos se reservan SIN seña. Es el comportamiento correcto —exigir seña
 * sin MercadoPago conectado dejaba al jugador colgado en el checkout, F-003 del
 * QA de producción— pero cambia cómo cobra el complejo y no puede enterarse por
 * casualidad.
 *
 * **No se menciona la cuenta de MercadoPago desvinculada**: el dato queda en el
 * audit log, que es donde sirve para reconstruir qué pasó. En un mail no agrega
 * nada que el dueño no sepa.
 */
export function renderAdminMpDisconnected(data: AdminMpDisconnectedData): EmailContent {
  const subject = `Se desvinculó Mercado Pago de ${data.tenantName}`

  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#d97706">Mercado Pago quedó desvinculado</h2>
  <p>Se revocó el permiso que le habías dado a TurnoGol para cobrar en la cuenta de Mercado Pago de <strong>${data.tenantName}</strong>. El cambio se hizo <strong>desde el panel de Mercado Pago</strong>, no desde TurnoGol.</p>
  <p><strong>Qué cambia desde ahora:</strong> los turnos se reservan <strong>sin seña</strong>. Apagamos el cobro de seña automáticamente, porque pedirla sin Mercado Pago conectado dejaría a tus jugadores trabados al momento de pagar.</p>
  <p>Los turnos ya confirmados y las señas ya cobradas <strong>no se tocan</strong>.</p>
  <p><strong>Si no fuiste vos</strong>, o si querés volver a cobrar señas: entrá a <strong>Configuración → Facturación</strong> en TurnoGol y conectá Mercado Pago de nuevo. Toma un minuto.</p>
  <p style="color:#64748b;font-size:14px">— TurnoGol</p>
</body>
</html>`

  const text = `Mercado Pago quedó desvinculado\n\nSe revocó el permiso que le habías dado a TurnoGol para cobrar en la cuenta de Mercado Pago de ${data.tenantName}. El cambio se hizo desde el panel de Mercado Pago, no desde TurnoGol.\n\nQué cambia desde ahora: los turnos se reservan sin seña. Apagamos el cobro de seña automáticamente, porque pedirla sin Mercado Pago conectado dejaría a tus jugadores trabados al momento de pagar.\n\nLos turnos ya confirmados y las señas ya cobradas no se tocan.\n\nSi no fuiste vos, o si querés volver a cobrar señas: entrá a Configuración → Facturación en TurnoGol y conectá Mercado Pago de nuevo. Toma un minuto.\n\n— TurnoGol`

  return { subject, html, text }
}
