'use client'

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next'

// Vercel Web Analytics (decisión 2026-11-08: medir la web pública, la
// calculadora y las landings). En Pro cada evento se cobra, así que el panel
// del staff y el super-admin no se miden: son las páginas que más se navegan y
// no son marketing. Una ruta nueva del panel que no esté acá solo suma eventos.
const EXCLUDED_PREFIXES = [
  // Panel del complejo: carpetas de `src/app/(admin)`.
  '/abonados',
  '/analiticas',
  '/caja',
  '/canchas',
  '/dashboard',
  '/deudas',
  '/grilla',
  '/jugadores',
  '/metricas',
  '/notificaciones',
  '/reportes',
  '/reservas',
  '/settings',
  '/staff',
  '/torneos',
  '/super-admin',
  '/select-tenant',
  '/mock-mp',
  // Auth con tokens y callbacks.
  '/api',
  '/reset-password',
  '/verify',
]

const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi

// Sin query string ni hash: el magic link, el reset y los retornos de pago
// llevan tokens ahí. Los ids de reservas en el path se reemplazan por `:id`.
function redact(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(event.url)
  const excluded = EXCLUDED_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  )
  if (excluded) return null
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(UUID_SEGMENT, '/:id')
  return { ...event, url: url.toString() }
}

export function SiteAnalytics() {
  return <Analytics beforeSend={redact} />
}
