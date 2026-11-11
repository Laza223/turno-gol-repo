import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'

/**
 * TG-HP-306 — Forzar estado: pasar al PLAN GRATIS (freemium 2026-11-08). Antes era
 * "bloquear"; desde el freemium la mora vencida baja a `free` y `blocked` dejó de
 * ser un destino forzable desde `suspended` (`FORCEABLE_TRANSITIONS`).
 * Rol: Super-admin (system_admin). CASO DE PLATA / FSM — NO se limpia la fila
 * final (queda viva para verificadores y para TG-HP-307, continuación natural).
 *
 * Fixture sembrado con runSql, independiente de TG-HP-305: `tenant_subscriptions`
 * en 'suspended' con `dunning_started_at` retroactivo ≥14 días (gate de
 * `transitionToFree` con origen `dunning_ended`,
 * SUSPENDED_TO_FREE_DAYS=14) + `tenants.status='suspended'` en espejo.
 * Evidence anchors: .../_components/support-actions/ForceStatusSection.tsx:43,81,98-112,
 * .../actions.ts:68-69,112-140, src/modules/super-admin/support.schema.ts:13-25,
 * src/modules/billing/lifecycle.service.ts:175-204.
 */
test.describe('TG-HP-306 — Forzar estado: plan gratis', () => {
  test('suspended → free con dunning ≥14 días, sin confirmación destructiva', async ({
    browser,
  }) => {
    await runSql(
      `
      INSERT INTO tenant_subscriptions
        (tenant_id, plan_id, billing_cycle, status, current_period_start, current_period_end, dunning_started_at)
      SELECT $1, id, 'monthly', 'suspended', NOW() - INTERVAL '20 days', NOW() + INTERVAL '10 days', NOW() - INTERVAL '15 days'
      FROM plans WHERE slug = 'predio'
      ON CONFLICT (tenant_id) DO UPDATE SET
        status = 'suspended',
        dunning_started_at = NOW() - INTERVAL '15 days',
        updated_at = NOW()
      `,
      [E2E_TENANT_ID],
    )
    await runSql(`UPDATE tenants SET status = 'suspended' WHERE id = $1`, [E2E_TENANT_ID])

    const ctx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    // Caso de plata: no se limpia la fila final (free) en finally.
    try {
      const page = await ctx.newPage()
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}?tab=acciones`)

      await expect(page.getByRole('heading', { name: 'Forzar transición de estado' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByText(/Estado actual: Suspendido\./)).toBeVisible()

      await page.locator('#force-target').selectOption('free')
      // `free` no es destructivo: no pide el nombre del complejo.
      await expect(page.locator('#force-confirm')).toHaveCount(0)
      await page.getByRole('button', { name: 'Forzar estado' }).click()

      await expect(page.getByText("Estado forzado: 'suspended' → 'free'.")).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(/Estado actual: Gratis\./)).toBeVisible()

      const tenantRow = (
        await runSql<{ status: string; scheduled_deletion_at: string | null }>(
          'SELECT status, scheduled_deletion_at FROM tenants WHERE id = $1',
          [E2E_TENANT_ID],
        )
      )[0]!
      const subRow = (
        await runSql<Record<string, unknown>>(
          'SELECT * FROM tenant_subscriptions WHERE tenant_id = $1',
          [E2E_TENANT_ID],
        )
      )[0]!
      expect(tenantRow.status).toBe('free')
      expect(tenantRow.scheduled_deletion_at).toBeNull()
      expect(subRow.status).toBe('free')
      expect(subRow.dunning_started_at).toBeNull()

      await writeEvidence('TG-HP-306', {
        status: 'pass',
        tenantRow,
        tenantSubscriptionRow: subRow,
        dbWrites: 'tenants.status, tenant_subscriptions.status (transitionToFree) + audit_logs',
        notes: 'CASO DE PLATA: fila final (free) queda viva para el verificador.',
      })
    } finally {
      await ctx.close()
    }
  })
})
