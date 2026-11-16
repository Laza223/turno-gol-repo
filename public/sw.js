/* Push de TurnoGol. Sin fetch handler: no intercepta la red de la grilla.
 * userVisibleOnly exige una notificación del sistema por cada push, también
 * cuando una pestaña está abierta. Un ACK de la página nunca la reemplaza.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

function targetUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//'))
    return '/dashboard'
  try {
    const url = new URL(value, self.location.origin)
    const allowed = [
      '/dashboard',
      '/grilla',
      '/reservas',
      '/caja',
      '/settings/facturacion',
      '/settings/whatsapp',
      '/notificaciones',
      '/whatsapp',
      '/mis-reservas',
    ]
    return url.origin === self.location.origin &&
      allowed.some((path) => url.pathname === path || url.pathname.startsWith(path + '/'))
      ? url.pathname + url.search + url.hash
      : '/dashboard'
  } catch {
    return '/dashboard'
  }
}

async function receipt(payload, stage) {
  if (
    !payload.deliveryId ||
    !payload.receiptToken ||
    payload.receiptUrl !== '/api/public/push/receipt'
  )
    return
  try {
    await fetch(payload.receiptUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deliveryId: payload.deliveryId, token: payload.receiptToken, stage }),
      credentials: 'omit',
    })
  } catch {
    /* Offline: el recibo es evidencia opcional, nunca una condición de entrega. */
  }
}

self.addEventListener('push', (event) => {
  let payload
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }
  if (!payload || typeof payload !== 'object') payload = {}
  const kind = payload.type || 'push'
  const id =
    payload.eventId ||
    (payload.bookingId ? `${kind}:${payload.bookingId}` : `${kind}:${Date.now()}`)
  const expired =
    typeof payload.expiresAt === 'string' && new Date(payload.expiresAt).getTime() <= Date.now()
  const mp = kind === 'mp_disconnected'
  const player = kind === 'player.reminder'
  const handoff = kind === 'whatsapp_handoff'
  const title = expired
    ? player
      ? 'Tus turnos en TurnoGol'
      : 'TurnoGol actualizado'
    : payload.title ||
      (mp
        ? 'MercadoPago se desconectó'
        : handoff
          ? 'WhatsApp: te necesitan en un chat'
          : payload.courtName
            ? `Nueva reserva — ${payload.courtName}`
            : 'Nueva reserva')
  const body = expired
    ? player
      ? 'Mirá tus próximos turnos en Mis reservas.'
      : 'La agenda cambió. Abrí TurnoGol para ver los datos actuales.'
    : typeof payload.body === 'string'
      ? payload.body
      : mp
        ? 'Las reservas online entran sin seña hasta que se reconecte.'
        : handoff
          ? payload.summaryLabel || ''
          : [payload.dateLabel, payload.timeLabel].filter(Boolean).join(' · ')
  const url = expired
    ? player
      ? '/mis-reservas'
      : '/dashboard'
    : targetUrl(payload.url || (mp ? '/dashboard' : '/grilla'))
  event.waitUntil(
    (async () => {
      // Urgente (reserva, cancelación, primera del día, recordatorio): queda fija
      // hasta que la toquen y vibra donde el sistema lo permite. El sonido lo
      // decide el teléfono (canal del sitio en Android, ajustes de la app en iOS).
      const urgent = payload.urgent === true && !expired
      await self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: String(id),
        renotify: false,
        requireInteraction: urgent,
        ...(urgent ? { vibrate: [200, 100, 200, 100, 400] } : {}),
        data: { url, payload },
      })
      // La nativa ya se mostró. No emitir otro sonido/toast en cada pestaña.
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('notif-dedupe')
          bc.postMessage({ id, nativeDisplayed: true })
          bc.close()
        }
      } catch {
        /* BroadcastChannel no está disponible en todos los dispositivos. */
      }
      await receipt(payload, 'processed')
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  event.waitUntil(
    (async () => {
      // No esperar al recibo antes de abrir: el teléfono puede estar sin conexión.
      const report = receipt(data.payload || {}, 'opened')
      const url = targetUrl(data.url)
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(url)
            } catch {
              /* El foco sigue funcionando offline. */
            }
          }
          await report
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url)
      await report
    })(),
  )
})
