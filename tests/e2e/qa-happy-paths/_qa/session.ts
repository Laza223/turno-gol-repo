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
 * Suprime el modal propio del permiso de push (decisión 2026-11-16): lo marca como
 * visto antes de que corran los scripts de página, para que no tape los clicks. Llamalo tras browser.newContext(), antes del goto.
 */
export async function suppressPushPrompt(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      // El modal propio del permiso se abre una vez por situación: marcarlas
      // todas como vistas (staff y jugador) para que no tape la pantalla.
      for (const audience of ['', ':player'])
        for (const status of ['unsupported', 'install_required', 'denied', 'unsubscribed'])
          localStorage.setItem(`turnogol:notif-modal-seen${audience}:${status}`, String(Date.now()))
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
