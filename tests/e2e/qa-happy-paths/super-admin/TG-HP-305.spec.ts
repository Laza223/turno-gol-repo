import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'

/**
 * TG-HP-305 — Forzar estado: SUSPENDER (`forceTenantStatusAction`, past_due→suspended).
 * Rol: Super-admin (system_admin). CASO DE PLATA / FSM — NO se limpia la fila
 * final (queda viva para verificadores y para TG-HP-306, que sigue la cadena).
 *
 * Fixture sembrado con runSql (independiente de qué dejó cualquier otro caso):
 * `tenant_subscriptions` en 'past_due' con `dunning_started_at` retroactivo
 * ≥7 días (gate de `transitionPastDueToSuspended`, lifecycle.service.ts:146-160,
 * PAST_DUE_TO_SUSPENDED_DAYS=7) + `tenants.status='past_due'` en espejo (ambas
 * WHERE de la transición lo exigen).
 * Evidence anchors: src/app/(super-admin)/super-admin/tenants/[id]/actions.ts:112-140,
 * .../_components/support-actions/ForceStatusSection.tsx:33-118,
 * src/modules/super-admin/support.service.ts:91-100,224-280,
 * src/modules/billing/lifecycle.service.ts:144-173.
 */
test.describe('TG-HP-305 — Forzar estado: suspender', () => {
  test('past_due → suspended con dunning ≥7 días', async ({ browser }) => {
    // ── Fixture (independiente de la corrida) ─────────────────────────────
    await runSql(
      `
      INSERT INTO tenant_subscriptions
        (tenant_id, plan_id, billing_cycle, status, current_period_start, current_period_end, dunning_started_at)
      SELECT $1, id, 'monthly', 'past_due', NOW() - INTERVAL '10 days', NOW() + INTERVAL '20 days', NOW() - INTERVAL '8 days'
      FROM plans WHERE slug = 'predio'
      ON CONFLICT (tenant_id) DO UPDATE SET
        status = 'past_due',
        dunning_started_at = NOW() - INTERVAL '8 days',
        updated_at = NOW()
      `,
      [E2E_TENANT_ID],
    )
    await runSql(`UPDATE tenants SET status = 'past_due' WHERE id = $1`, [E2E_TENANT_ID])

    const ctx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    // Caso de plata: solo se cierra el contexto del browser — la fila final
    // (tenants/tenant_subscriptions en 'suspended') queda viva a propósito.
    try {
      const page = await ctx.newPage()
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}?tab=acciones`)

      await expect(page.getByRole('heading', { name: 'Forzar transición de estado' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByText(/Estado actual: Pago vencido\./)).toBeVisible()

      // ── Componente: no destructiva, sin confirmación de nombre ──────────
      await page.locator('#force-target').selectOption('suspended')
      const forceBtn = page.getByRole('button', { name: 'Forzar estado' })
      await expect(forceBtn).toBeEnabled()
      await expect(page.locator('#force-confirm')).not.toBeVisible()

      await forceBtn.click()

      // ── Feedback inline real + UI-sin-reload (mismo tab, sin navegación) ─
      await expect(page.getByText("Estado forzado: 'past_due' → 'suspended'.")).toBeVisible({
        timeout: 10_000,
      })
      expect(page.url()).toContain('?tab=acciones')
      await expect(page.getByText(/Estado actual: Suspendido\./)).toBeVisible()

      // ── DB ────────────────────────────────────────────────────────────
      const tenantRow = (
        await runSql<{ status: string }>('SELECT status FROM tenants WHERE id = $1', [
          E2E_TENANT_ID,
        ])
      )[0]!
      const subRow = (
        await runSql<Record<string, unknown>>(
          'SELECT * FROM tenant_subscriptions WHERE tenant_id = $1',
          [E2E_TENANT_ID],
        )
      )[0]!
      expect(tenantRow.status).toBe('suspended')
      expect(subRow.status).toBe('suspended')

      const auditRow = (
        await runSql<{ action: string; metadata: unknown }>(
          `SELECT action, metadata FROM audit_logs
           WHERE tenant_id = $1 AND action = 'support.tenant.status_forced'
           ORDER BY created_at DESC LIMIT 1`,
          [E2E_TENANT_ID],
        )
      )[0]

      await writeEvidence('TG-HP-305', {
        status: 'pass',
        tenantRow,
        tenantSubscriptionRow: subRow,
        latestSupportAuditLog: auditRow ?? null,
        dbWrites:
          'tenants.status, tenant_subscriptions.status (lifecycle.service.ts:146-173) + audit_logs',
        notes:
          'CASO DE PLATA: fila final (suspended) queda viva a propósito para el verificador y para TG-HP-306.',
      })
    } finally {
      await ctx.close()
    }
  })
})
