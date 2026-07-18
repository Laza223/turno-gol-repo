import { test, expect } from '@playwright/test'
import { writeEvidence } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'

/**
 * TG-HP-301 — Login super-admin + acceso a `/super-admin` (triple guard).
 * Rol: Super-admin (system_admin). Prereq: fixture `e2e-superadmin@turnogol.test`
 * ya seedeado (system_admins.status='active', claim JWT is_system_admin=true,
 * email en SYSTEM_ADMIN_EMAILS). Mint por cookie (newAuthedContext) — no se
 * tipea password: cubre el guard `requireSystemAdmin()` del layout, no el form
 * de /login (Hallazgo #3 del manual DESACTUALIZADO: `loginAction` no rutea a
 * /super-admin, hay que navegar directo — ver GAP 1 del manual).
 * También cubre el lado negativo: una sesión staff normal (admin, NO
 * system_admin) es redirigida a /login por el mismo guard.
 * Evidence anchors: src/modules/auth/system-admin.guards.ts:59-130,
 * src/app/(super-admin)/super-admin/layout.tsx:65-88.
 */
test.describe('TG-HP-301 — Login super-admin + triple guard', () => {
  test('sesión super-admin entra a /super-admin; sesión admin normal es redirigida a /login', async ({
    browser,
  }) => {
    // ── Positivo: super-admin ──────────────────────────────────────────────
    const saCtx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    let saFinalUrl = ''
    let saStatus: number | null = null
    try {
      const saPage = await saCtx.newPage()
      const response = await saPage.goto('/super-admin')
      saStatus = response?.status() ?? null

      // Triple guard OK → layout renderiza SuperAdminLayoutShell (badge +
      // email del system admin) + el dashboard global.
      await expect(saPage.getByRole('heading', { name: 'Dashboard global' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(saPage.getByText('SuperAdmin', { exact: true })).toBeVisible()
      await expect(saPage.getByText(QA_EMAILS.superadmin)).toBeVisible()

      const url = new URL(saPage.url())
      expect(url.pathname).toBe('/super-admin') // NO redirect a /login
      saFinalUrl = saPage.url()
    } finally {
      await saCtx.close()
    }

    // ── Negativo: staff admin normal (no system_admin) ─────────────────────
    const adminCtx = await newAuthedContext(browser, QA_EMAILS.admin)
    let adminFinalUrl = ''
    try {
      const adminPage = await adminCtx.newPage()
      await adminPage.goto('/super-admin')
      await adminPage.waitForURL(/\/login/, { timeout: 15_000 })
      expect(new URL(adminPage.url()).pathname).toBe('/login')
      adminFinalUrl = adminPage.url()
    } finally {
      await adminCtx.close()
    }

    await writeEvidence('TG-HP-301', {
      status: 'pass',
      superadmin: { finalUrl: saFinalUrl, httpStatus: saStatus },
      nonSuperAdminAdmin: { finalUrl: adminFinalUrl, redirectedToLogin: true },
      dbWrites: 'ninguno directo del caso (recordLastLogin en el layout es fire-and-forget, throttle 15min)',
      notes:
        'Mint por cookie (newAuthedContext), no por el form de /login: el guard verificado es ' +
        'requireSystemAdmin() (system-admin.guards.ts), no loginAction. Consistente con GAP 1 del manual.',
    })
  })
})
