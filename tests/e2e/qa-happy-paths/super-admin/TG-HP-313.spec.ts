import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'

/**
 * TG-HP-313 — Impersonar (`startImpersonationAction`) → `/dashboard` → detener
 * (`stopImpersonationAction`).
 * Rol: Super-admin (system_admin). Prereq: tenant con admin activo (E2E Admin).
 * La impersonación bypasea el hard-lock de billing (src/app/(admin)/layout.tsx:16-47)
 * — no depende del `tenants.status` que hayan dejado los casos FSM previos.
 * `window.confirm` nativo (no modal del design system) — se maneja con el
 * evento `dialog` de Playwright, aceptado ANTES de disparar el click.
 * Evidence anchors: .../_components/impersonate-button.tsx:21-67,
 * src/components/layout/impersonation-banner.tsx:15-41,
 * .../tenants/[id]/actions.ts:384-480, src/app/(admin)/layout.tsx:16-47,
 * src/shared/security/impersonation-cookie.ts:21-24,62-73.
 */
test.describe('TG-HP-313 — Impersonar / detener', () => {
  test('entra a /dashboard con banner rojo + cookie firmada, sale y vuelve al detalle', async ({
    browser,
  }) => {
    const tenantRow = (
      await runSql<{ name: string }>('SELECT name FROM tenants WHERE id = $1', [E2E_TENANT_ID])
    )[0]!

    const ctx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    try {
      const page = await ctx.newPage()
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}`)
      await expect(page.getByRole('heading', { name: 'Soporte' })).toBeVisible({
        timeout: 15_000,
      })

      // ── window.confirm nativo ────────────────────────────────────────────
      let dialogMessage = ''
      page.once('dialog', async (dialog) => {
        dialogMessage = dialog.message()
        await dialog.accept()
      })

      await page.getByRole('button', { name: 'Entrar como este complejo' }).click()

      await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
      expect(dialogMessage).toBe(
        `Vas a entrar al panel de "${tenantRow.name}" como soporte. Todas tus acciones quedarán auditadas a tu nombre de super admin. ¿Continuar?`,
      )

      // ── Banner rojo fijo (role=alert) ────────────────────────────────────
      // Scopeado por texto: Next también renderiza un role=alert propio
      // (`#__next-route-announcer__`, siempre presente), un getByRole('alert')
      // plano matchea ambos (strict mode violation).
      const banner = page.getByRole('alert').filter({ hasText: 'Impersonando' })
      await expect(banner).toContainText(
        `Impersonando ${tenantRow.name} — todas las acciones se auditan como super admin.`,
      )

      // ── Cookie firmada ────────────────────────────────────────────────────
      const cookiesDuring = await ctx.cookies()
      const impCookie = cookiesDuring.find((c) => c.name === 'tg_sa_impersonate')
      expect(impCookie).toBeTruthy()
      expect(impCookie?.httpOnly).toBe(true)

      // ── Detener impersonación (form action, sin JS) ──────────────────────
      await banner.getByRole('button', { name: 'Salir de impersonación' }).click()
      await page.waitForURL(new RegExp(`/super-admin/tenants/${E2E_TENANT_ID}$`), {
        timeout: 15_000,
      })

      const cookiesAfter = await ctx.cookies()
      expect(cookiesAfter.find((c) => c.name === 'tg_sa_impersonate')).toBeUndefined()
      // Mismo scope que `banner`: sin filtrar por texto, este locator también
      // matchea (y queda "visible" per Playwright) el role=alert del route
      // announcer de Next, que persiste tras salir de la impersonación.
      await expect(page.getByRole('alert').filter({ hasText: 'Impersonando' })).not.toBeVisible()

      // ── DB ────────────────────────────────────────────────────────────
      const auditRows = await runSql<{ action: string; metadata: unknown }>(
        `SELECT action, metadata FROM audit_logs
         WHERE tenant_id = $1 AND action IN ('support.impersonation.started', 'support.impersonation.ended')
         ORDER BY created_at DESC LIMIT 2`,
        [E2E_TENANT_ID],
      )
      const actions = auditRows.map((r) => r.action).sort()
      expect(actions).toEqual(
        ['support.impersonation.ended', 'support.impersonation.started'].sort(),
      )

      await writeEvidence('TG-HP-313', {
        status: 'pass',
        tenantName: tenantRow.name,
        dialogMessage,
        impersonationAuditLogs: auditRows,
        dbWrites:
          'audit_logs (support.impersonation.started/ended) — sin cambios de estado en tenants/tenant_subscriptions',
        notes:
          'Cookie tg_sa_impersonate httpOnly verificada presente durante la impersonación y ausente tras salir. ' +
          'Bypasea el hard-lock de billing: no depende del tenants.status dejado por los casos FSM previos (305-310).',
      })
    } finally {
      await ctx.close()
    }
  })
})
