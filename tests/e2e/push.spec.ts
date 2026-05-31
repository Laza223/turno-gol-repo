/**
 * E2E — Web Push notifications (audit T6, fase F9)
 *
 * Scope v1:
 *   #1  Single context: admin logs in, navigates to /admin/grilla, manually posts
 *       a BroadcastChannel message (simulating what the SW would broadcast after
 *       receiving a real push), asserts the payload-specific toast renders.
 *
 * Why BroadcastChannel injection instead of real push delivery:
 *   Real Web Push requires a real VAPID server + a real browser push endpoint
 *   (Google FCM, Mozilla Autopush, etc.). The dev server has VAPID env placeholders
 *   for E2E (see playwright.config.ts webServer.env). Exercising the full loop
 *   (API → pg-boss → worker → sendPushNotification → FCM → SW → page) is out of
 *   scope for v1 E2E; it requires an external push relay and is not deterministic
 *   in CI. Instead, we inject a BroadcastChannel message directly via page.evaluate
 *   to test the in-page listener and toast rendering.
 *
 * Multi-tab dedupe status:
 *   Playwright browser contexts are isolated sessions and do NOT share a
 *   BroadcastChannel even within the same browser binary — the BC spec requires
 *   same-origin same-browsing-context-group, which Playwright contexts are not.
 *   Therefore the multi-tab dedupe assertion is NOT exercised here. It has been
 *   verified manually with 2 real Chrome tabs open on localhost. The unit-level
 *   guarantee lives in tests/unit/push-dedupe.test.ts (6 cases, T5).
 *
 * Chromium only:
 *   Service Worker + Web Push are fully supported in Chromium. Firefox and Safari
 *   have partial support gated behind PWA install (Safari iOS 16.4+). This spec
 *   is explicitly restricted to Chromium for v1.
 *
 * Execution:
 *   NOT run in this audit session. Requires `pnpm dev` + `npx playwright install chromium`.
 *   Delegated to CI or manual run.
 *   Type-checked via `pnpm typecheck` (tsconfig includes **\/*.ts).
 *
 * Tags: @push @chromium-only
 */

import { test, expect } from './fixtures'

test.describe('Push notifications — in-page BroadcastChannel toast (@push @chromium-only)', () => {
  // Skip on any browser that is not Chromium.
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Web Push E2E supported only in Chromium for v1 (see spec header).',
  )

  test(
    'BroadcastChannel message triggers payload-specific toast on /admin/grilla @critical',
    async ({ browser, adminStorageState }) => {
      const context = await browser.newContext({
        storageState: JSON.parse(adminStorageState),
        // Grant notification permission so the page does not block on the
        // Notification.permission === 'denied' branch inside PushNotificationManager.
        permissions: ['notifications'],
      })

      try {
        const page = await context.newPage()
        // /grilla — the (admin) folder is a Next.js route group, not part of
        // the URL. Hitting /admin/grilla returns 404 and the test times out
        // waiting for the table.
        await page.goto('/grilla')

        // Wait for the page to be interactive (table or heading visible).
        await expect(page.locator('table')).toBeVisible({ timeout: 15_000 })

        // Manually post a BroadcastChannel message from the page's JS context.
        // This simulates what public/sw.js broadcasts when it receives a real
        // Web Push notification from the server.
        await page.evaluate(() => {
          const bc = new BroadcastChannel('notif-dedupe')
          bc.postMessage({
            id: 'e2e-push-test-001',
            courtName: 'Cancha 1',
            dateLabel: 'mañana',
            timeLabel: '20:00',
          })
          bc.close()
        })

        // PushNotificationManager.onmessage claims the notification (acks first)
        // then calls toast({ title: 'Nueva reserva — Cancha 1', ... }).
        // Toast title format: `Nueva reserva — ${courtName}`.
        await expect(page.getByText('Nueva reserva — Cancha 1')).toBeVisible({
          timeout: 2_000,
        })

        // Also assert the date+time description is rendered.
        await expect(page.getByText('mañana · 20:00')).toBeVisible({ timeout: 2_000 })
      } finally {
        await context.close()
      }
    },
  )
})
