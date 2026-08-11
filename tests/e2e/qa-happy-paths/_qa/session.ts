import type { Browser, BrowserContext } from '@playwright/test'
import { buildStorageState } from '../../_helpers/auth-state'

/**
 * Session minting for QA specs. Reuses the exact cookie-mint the E2E harness uses
 * (buildStorageState → magic-link generateLink + verifyOtp + setSession). NO
 * passwords are ever typed. Safe to mint in-worker because the QA config runs
 * workers:1 (serial) — parallel generateLink for the same email would race.
 *
 * Canonical seeded emails:
 *   admin        e2e-admin@turnogol.test        (tenant Demo, role admin)
 *   admin-2      e2e-admin-2@turnogol.test       (tenant Demo)
 *   admin-fresh  e2e-admin-fresh@turnogol.test   (0 tenants → onboarding wizard)
 *   player       e2e-player@turnogol.test        (passwordless, linked Demo + Seña)
 *   superadmin   e2e-superadmin@turnogol.test    (system_admins active + is_system_admin)
 */

/** Mint a fresh authenticated context for `email` on top of `browser`. */
export async function newAuthedContext(browser: Browser, email: string): Promise<BrowserContext> {
  const state = await buildStorageState(email)
  const context = await browser.newContext()
  await context.addCookies(state.cookies)
  return context
}

/**
 * Suprime el banner de push (PushNotificationManager, fixed bottom-left z-40 que
 * intercepta clicks en botones de acción — ENS-11). Setea el dismiss key antes de
 * que corran los scripts de página. Llamalo tras browser.newContext(), antes del goto.
 */
export async function suppressPushPrompt(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('turnogol:notif-banner-dismissed-at', String(Date.now()))
    } catch {
      /* noop */
    }
  })
}

export const QA_EMAILS = {
  admin: 'e2e-admin@turnogol.test',
  admin2: 'e2e-admin-2@turnogol.test',
  adminFresh: 'e2e-admin-fresh@turnogol.test',
  player: 'e2e-player@turnogol.test',
  superadmin: 'e2e-superadmin@turnogol.test',
} as const
