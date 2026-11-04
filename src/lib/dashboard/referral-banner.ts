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
import type { StaffRole } from '@/modules/staff/roles'

export type ReferralBannerVisibilityInput = {
  role: StaffRole
  /** `tenants.referral_code`: null solo si falló la generación del alta. */
  referralCode: string | null
  /** `tenant.settings.referral_banner_dismissed_at`, ISO o ausente. */
  dismissedAt?: string | null
}

/**
 * Solo admin, con código ya generado y sin descartar. El programa es
 * permanente (docs/decisions/2026-10-31-referidos-permanentes.md): no hay
 * ventana de fechas. El componente no sabe de roles — la página decide y le
 * pasa el resultado.
 */
export function shouldShowReferralBanner({
  role,
  referralCode,
  dismissedAt,
}: ReferralBannerVisibilityInput): boolean {
  if (role !== 'admin') return false
  if (!referralCode) return false
  return !dismissedAt
}
