import { logger } from '@/shared/lib/logger'

/**
 * Link absoluto a una pantalla del panel, para los botones de los mails.
 *
 * Los mails de la cuota tenían `https://app.turnogol.app/...` escrito a mano, y
 * ese subdominio NO existe (medido 2026-09-27: NXDOMAIN). Todos los botones de
 * "Activá tu suscripción", "Actualizá tu pago" y "Terminá el alta" llevaban a
 * una página que no carga.
 *
 * Los mails se renderizan en el worker de Railway (`send-email.worker.ts`), que
 * NO corre la validación de `shared/env.ts` al arrancar: si la variable faltara
 * ahí, el fallback a localhost saldría en mails reales sin que nadie se entere.
 * Por eso ese caso se loguea como error (llega a Sentry). Medido el 2026-09-27:
 * `NEXT_PUBLIC_APP_URL=https://turnogol.app` en el worker de producción.
 */
export function appLink(path: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (!configured && process.env.NODE_ENV === 'production') {
    logger.error('appLink: falta NEXT_PUBLIC_APP_URL, el link del mail apunta a localhost', {
      module: 'notifications',
      path,
    })
  }
  const base = (configured ?? 'http://localhost:3000').replace(/\/+$/, '')
  return `${base}${path}`
}
