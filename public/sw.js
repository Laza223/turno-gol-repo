/* TurnoGol Push Service Worker (Fase F9)
 *
 * Scopes: registered with { scope: '/admin/' } from PushNotificationManager.
 *
 * Handles:
 *  - 'install' / 'activate' — skipWaiting + clients.claim for fast updates.
 *  - 'push'                 — receives push payload. Broadcasts {id} on
 *                             'notif-dedupe' channel. First open tab that
 *                             acks within 100ms shows in-app toast. If no
 *                             ack → fallback to native showNotification.
 *  - 'notificationclick'    — focus existing /admin tab matching origin or
 *                             open a new window at payload.url.
 *
 * NO 'fetch' listener — this SW must NOT intercept network requests; the
 * grilla (F3) realtime depends on direct fetch. Only push + notification
 * lifecycle.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch (e) {
    payload = { type: 'unknown', courtName: 'Notificación' }
  }
  const id = payload.bookingId || payload.type || String(Date.now())
  const showFallback = async () => {
    const bc = new BroadcastChannel('notif-dedupe')
    const acked = await new Promise((resolve) => {
      let resolved = false
      const timer = setTimeout(() => {
        if (!resolved) { resolved = true; resolve(false) }
      }, 150)
      bc.onmessage = (msg) => {
        if (resolved) return
        const data = msg.data || {}
        if (data.id === id && data.ack === true) {
          resolved = true
          clearTimeout(timer)
          resolve(true)
        }
      }
      bc.postMessage({ id })
    })
    bc.close()
    if (acked) return
    const title = payload.courtName ? `Nueva reserva — ${payload.courtName}` : 'Nueva reserva'
    const body = [payload.dateLabel, payload.timeLabel].filter(Boolean).join(' · ')
    const url = payload.url || '/admin/grilla'
    await self.registration.showNotification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: id,
      renotify: false,
      data: { url, payload },
    })
  }
  event.waitUntil(showFallback())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/admin/grilla'
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
        await client.focus()
        if ('navigate' in client) {
          try { await client.navigate(targetUrl) } catch (_e) { /* swallow */ }
        }
        return
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl)
    }
  })())
})
