import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'

/**
 * TG-HP-306 — Forzar estado: BLOQUEAR (destructiva — exige escribir nombre exacto).
 * Rol: Super-admin (system_admin). CASO DE PLATA / FSM — NO se limpia la fila
 * final (queda viva para verificadores y para TG-HP-307, continuación natural).
 *
 * Fixture sembrado con runSql, independiente de TG-HP-305: `tenant_subscriptions`
 * en 'suspended' con `dunning_started_at` retroactivo ≥14 días (gate de
 * `transitionSuspendedToBlocked`, lifecycle.service.ts:177-191,
 * SUSPENDED_TO_BLOCKED_DAYS=14) + `tenants.status='suspended'` en espejo.
 * Evidence anchors: .../_components/support-actions/ForceStatusSection.tsx:43,81,98-112,
 * .../actions.ts:68-69,112-140, src/modules/super-admin/support.schema.ts:13-25,
 * src/modules/billing/lifecycle.service.ts:175-204.
 */
test.describe('TG-HP-306 — Forzar estado: bloquear (destructiva)', () => {
  test('suspended → blocked con dunning ≥14 días, exige nombre exacto del tenant', async ({
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

    const tenantRowBefore = (
      await runSql<{ name: string }>('SELECT name FROM tenants WHERE id = $1', [E2E_TENANT_ID])
    )[0]!

    const ctx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    // Caso de plata: no se limpia la fila final (blocked) en finally.
    try {
      const page = await ctx.newPage()
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}?tab=acciones`)

      await expect(page.getByRole('heading', { name: 'Forzar transición de estado' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByText(/Estado actual: Suspendido\./)).toBeVisible()

      await page.locator('#force-target').selectOption('blocked')

      // ── Componente: destructiva → bloque rojo + botón deshabilitado hasta
      //    que el nombre tipeado coincide EXACTO ────────────────────────────
      // Scopeado por `for="force-confirm"`: el mismo texto de "Acción
      // destructiva" también aparece en el label `for="cancel-confirm"` del
      // dialog de cancelar suscripción (CancelSection.tsx), un getByText
      // plano matchearía ambos (strict mode violation).
      const confirmLabel = page.locator('label[for="force-confirm"]')
      await expect(confirmLabel).toContainText(
        `Acción destructiva. Escribí el nombre exacto del complejo (${tenantRowBefore.name}) para confirmar:`,
      )
      const confirmInput = page.locator('#force-confirm')
      const forceBtn = page.getByRole('button', { name: 'Forzar estado' })
      await expect(forceBtn).toBeDisabled()

      await confirmInput.fill('nombre incorrecto')
      await expect(forceBtn).toBeDisabled()

      await confirmInput.fill(tenantRowBefore.name)
      await expect(forceBtn).toBeEnabled()

      await forceBtn.click()

      await expect(page.getByText("Estado forzado: 'suspended' → 'blocked'.")).toBeVisible({
        timeout: 10_000,
      })
      expect(page.url()).toContain('?tab=acciones')
      await expect(page.getByText(/Estado actual: Bloqueado\./)).toBeVisible()

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
      expect(tenantRow.status).toBe('blocked')
      expect(subRow.status).toBe('blocked')

      await writeEvidence('TG-HP-306', {
        status: 'pass',
        tenantRow,
        tenantSubscriptionRow: subRow,
        confirmedName: tenantRowBefore.name,
        dbWrites:
          'tenants.status, tenant_subscriptions.status (lifecycle.service.ts:177-204) + audit_logs',
        notes:
          'CASO DE PLATA: fila final (blocked) queda viva para el verificador y para TG-HP-307. ' +
          'Confirmación server-side re-validada (confirmNameMatches) — se probó primero con nombre incorrecto (botón sigue disabled).',
      })
    } finally {
      await ctx.close()
    }
  })
})
