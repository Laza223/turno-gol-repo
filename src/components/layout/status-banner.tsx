'use client'

import Link from 'next/link'
import type { ActionResult } from '@/shared/types/action-result'
import { FREE_ONLINE_BOOKINGS_PER_MONTH } from '@/shared/constants'
import { ResumeOnlineButton } from './resume-online-button'
import { AlertTriangle, Info, XCircle } from 'lucide-react'
import type { StaffRole } from '@/modules/staff/roles'

/**
 * La banda de estado de la cuenta, arriba de toda pantalla del panel. Es solo
 * para lo que corta o puede cortar el servicio (servicio degradado, pago
 * fallido, suscripción cancelada, solo lectura). El período de prueba NO va
 * acá desde el 2026-09-24: vive en el pie del riel, arriba de Ayuda
 * (`admin-sidebar.tsx`), porque una banda de 90 días le comía a cada vista el
 * alto de un renglón de trabajo.
 */
/**
 * Por qué el complejo está en solo lectura y hasta cuándo. Desde el freemium
 * (2026-11-08) el único origen es la mora: la prueba vencida baja al plan gratis.
 */
export type ReadOnlyNotice = { origin: 'dunning'; until: string | null }

/**
 * Plan gratis: si llegó al tope de reservas online del mes o si la reserva
 * online está en pausa por cancelaciones. Lo arma el layout de (admin).
 */
export type FreePlanNotice = { capReached: boolean; paused: boolean }

interface StatusBannerProps {
  tenantStatus: string
  periodEnd: string | null
  /** Solo para `suspended`. Sin valor, se usa el texto de la mora. */
  readOnly?: ReadOnlyNotice | null
  /** Rol del staff logueado: solo el dueño ve el botón de pagar. */
  staffRole?: StaffRole
  /** Solo para `free`. */
  freePlan?: FreePlanNotice | null
  /** "Ya marqué mis ocupados" de la pausa del plan gratis (llega por prop). */
  resumeOnlineAction?: () => Promise<ActionResult>
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
 * Igual que `formatDate`, pero con la zona fija: el banner se renderiza en el
 * servidor (UTC) y se hidrata en el navegador (ART), y una fecha de corte
 * cerca de la medianoche daría un día distinto en cada lado.
 */
function formatArtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
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
  readOnly,
  staffRole,
  freePlan,
  resumeOnlineAction,
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

  // Priority 4: Solo lectura (`suspended`). Desde 2026-10-22 el panel se ve
  // pero no se opera: la prueba vencida y la mora entran acá
  // (`docs/decisions/2026-10-22-solo-lectura-al-vencer-la-prueba.md`). La
  // salida es `/reactivar`, que es solo del dueño: el encargado lee a quién
  // avisarle en lugar de un botón que lo rebotaría.
  if (tenantStatus === 'suspended') {
    return (
      <div
        role="status"
        className="flex items-center gap-3 px-4 py-3 bg-red-50 border-b border-red-200 text-sm text-red-800 dark:bg-red-500/10 dark:border-red-500/25 dark:text-red-200"
      >
        <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
        <span className="flex-1">
          Tu cuenta está suspendida por falta de pago. El panel quedó en solo lectura: podés ver
          todo, pero no cargar ni cambiar nada.
          {readOnly?.until && (
            <>
              {' '}
              Tenés hasta el <strong>{formatArtDate(readOnly.until)}</strong> para activarlo;
              después se corta el acceso.
            </>
          )}
          {staffRole !== 'admin' && ' Avisale al dueño del complejo.'}
        </span>
        {staffRole === 'admin' && (
          <Link
            href="/reactivar"
            className={ctaClass('hover:text-red-900 dark:hover:text-red-300')}
          >
            Regularizar pago
          </Link>
        )}
      </div>
    )
  }

  // Priority 5: plan gratis (freemium, 2026-11-08). En gratis solo entra el
  // dueño, así que el botón no depende del rol. La pausa manda sobre el tope:
  // es lo único que el dueño puede destrabar sin pagar.
  if (tenantStatus === 'free') {
    if (freePlan?.paused) {
      return (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/25 dark:text-amber-200"
        >
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <span className="flex-1">
            Pausamos tus reservas online porque cancelaste varias este mes. Marcá en la grilla los
            horarios que ya están ocupados y avisanos.
          </span>
          {resumeOnlineAction && <ResumeOnlineButton action={resumeOnlineAction} />}
        </div>
      )
    }
    return (
      <div
        role="status"
        className="flex items-center gap-3 px-4 py-3 bg-sky-50 border-b border-sky-200 text-sm text-sky-900 dark:bg-sky-500/10 dark:border-sky-500/25 dark:text-sky-100"
      >
        <Info className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
        <span className="flex-1">
          {freePlan?.capReached
            ? `Tus jugadores ya te reservaron ${FREE_ONLINE_BOOKINGS_PER_MONTH} turnos online este mes. Pasá al plan para que sigan reservando.`
            : 'Estás en el plan gratis. Tus jugadores te reservan online. Anotar tus turnos, los fijos y la caja es con el plan.'}
        </span>
        <Link href="/reactivar" className={ctaClass('hover:text-sky-950 dark:hover:text-sky-50')}>
          Pasar al plan
        </Link>
      </div>
    )
  }

  return null
}
