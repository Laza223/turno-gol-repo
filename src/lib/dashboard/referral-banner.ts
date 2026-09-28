/**
 * Visibilidad pura del aviso de referidos de Hoy (R1/R2,
 * docs/decisions/2026-09-26-referidos.md). Vive FUERA de
 * `ReferralShareBanner.tsx` (`'use client'`) a propósito: `page.tsx` es un
 * Server Component y necesita EJECUTAR esta función, no solo importar su
 * tipo — un import de valor desde un módulo `'use client'` hacia un Server
 * Component no cruza el boundary (candado en
 * `tests/unit/server-no-importa-valores-de-modulos-client.test.ts`, caso real
 * 2026-08-20 con `CANCELABLE`).
 */
import { REFERRAL_PROMO_ENDS_AT } from '@/shared/constants'
import type { StaffRole } from '@/modules/staff/roles'

export type ReferralBannerVisibilityInput = {
  role: StaffRole
  /** `tenants.referral_code`: null hasta que el super-admin lo genera. */
  referralCode: string | null
  /** `tenant.settings.referral_banner_dismissed_at`, ISO o ausente. */
  dismissedAt?: string | null
  now: Date
}

/**
 * Solo admin, con código ya generado, sin descartar y dentro de la ventana de
 * la promo. El componente no sabe de fechas ni roles — la página decide y le
 * pasa el resultado.
 */
export function shouldShowReferralBanner({
  role,
  referralCode,
  dismissedAt,
  now,
}: ReferralBannerVisibilityInput): boolean {
  if (role !== 'admin') return false
  if (!referralCode) return false
  if (dismissedAt) return false
  return now.getTime() <= REFERRAL_PROMO_ENDS_AT.getTime()
}
