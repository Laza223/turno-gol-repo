'use client'

import Link from 'next/link'
import { AlertTriangle, XCircle } from 'lucide-react'
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP_NUMBER, SUPPORT_WHATSAPP_URL } from '@/shared/constants'

/**
 * La banda de estado de la cuenta, arriba de toda pantalla del panel. Es solo
 * para lo que corta o puede cortar el servicio (servicio degradado, pago
 * fallido, suscripción cancelada, cuenta suspendida). El período de prueba NO va
 * acá desde el 2026-09-24: vive en el pie del riel, arriba de Ayuda
 * (`admin-sidebar.tsx`), porque una banda de 90 días le comía a cada vista el
 * alto de un renglón de trabajo.
 */
interface StatusBannerProps {
  tenantStatus: string
  periodEnd: string | null
  /**
   * Override para Storybook/tests: por default lee `NEXT_PUBLIC_SERVICE_DEGRADED`
   * (deploy-playbook.md — toggle sin redeploy de código). Nadie en la app real
   * pasa esta prop; el default preserva el comportamiento exacto de siempre.
   */
  serviceDegraded?: boolean
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
}

/**
 * F-015 (QA de producción 2026-08-17): los CTA del banner eran links de texto
 * pelado — 71 × 20 px medidos en 375 px de ancho, menos de la mitad del mínimo
 * de 44 px. Uno de ellos ("Elegir plan") es literalmente el camino por el que el
 * complejo empieza a pagar. `min-h-11` (44 px) solo en mobile: en desktop el
 * puntero no necesita el área y el alto extra desbalancearía la barra.
 */
function ctaClass(hover: string): string {
  return `inline-flex min-h-11 items-center px-1 font-semibold underline underline-offset-2 transition-colors duration-150 shrink-0 md:min-h-0 ${hover}`
}

export function StatusBanner({
  tenantStatus,
  periodEnd,
  serviceDegraded = process.env.NEXT_PUBLIC_SERVICE_DEGRADED === 'true',
}: StatusBannerProps) {
  // Priority 1: Service degraded
  if (serviceDegraded) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/25 dark:text-amber-200">
        <AlertTriangle
          className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <span>
          Estamos experimentando problemas técnicos. Algunas funciones pueden no estar disponibles.
        </span>
      </div>
    )
  }

  // Priority 2: Past due
  if (tenantStatus === 'past_due' && periodEnd) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border-b border-red-200 text-sm text-red-800 dark:bg-red-500/10 dark:border-red-500/25 dark:text-red-200">
        <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
        <span className="flex-1">
          Tu pago falló. Regularizá antes del <strong>{formatDate(periodEnd)}</strong>.
        </span>
        <Link href="/reactivar" className={ctaClass('hover:text-red-900 dark:hover:text-red-300')}>
          Actualizar pago
        </Link>
      </div>
    )
  }

  // Priority 3: Canceled (voluntary, ENS-25/26). El acceso sigue intacto
  // hasta `periodEnd` — el hard-lock del layout NO incluye `canceled` (el
  // sweep `canceled → blocked` recién corta el acceso cuando vence el
  // período; `blocked` sí sigue en el hard-lock).
  if (tenantStatus === 'canceled' && periodEnd) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/25 dark:text-amber-200">
        <XCircle
          className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <span className="flex-1">
          Cancelaste tu suscripción. Tenés acceso hasta el <strong>{formatDate(periodEnd)}</strong>.
          Podés reactivarla cuando quieras.
        </span>
        <Link
          href="/reactivar"
          className={ctaClass('hover:text-amber-900 dark:hover:text-amber-300')}
        >
          Reactivar
        </Link>
      </div>
    )
  }

  // Priority 4: Suspended
  if (tenantStatus === 'suspended') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border-b border-red-200 text-sm text-red-800 dark:bg-red-500/10 dark:border-red-500/25 dark:text-red-200">
        <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
        <span>
          Tu cuenta está suspendida. Contactá a soporte por{' '}
          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2 hover:text-red-900 dark:hover:text-red-300 transition-colors duration-150"
          >
            WhatsApp ({SUPPORT_WHATSAPP_NUMBER})
          </a>{' '}
          o por mail a{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium underline underline-offset-2 hover:text-red-900 dark:hover:text-red-300 transition-colors duration-150"
          >
            {SUPPORT_EMAIL}
          </a>
        </span>
      </div>
    )
  }

  return null
}
