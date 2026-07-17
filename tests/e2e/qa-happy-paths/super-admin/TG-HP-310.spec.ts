import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'

/**
 * TG-HP-310 — Cancelar suscripción (`cancelSubscriptionAction`, destructiva:
 * nombre exacto + motivo 3–500 chars).
 * Rol: Super-admin (system_admin). CASO DE PLATA / FSM — NO se limpia la fila
 * final (queda viva para verificadores).
 *
 * Fixture sembrado con runSql: suscripción `active` (independiente de qué plan
 * dejó TG-HP-309) + `tenants.status='active'`. `mp_subscription_id=NULL` →
 * `billingCancel()` no llama a `gateway.cancelPreapproval` (manual §TG-HP-310).
 * Evidence anchors: .../_components/support-actions/CancelSection.tsx:17-88,
 * .../actions.ts:68-69,208-239, src/modules/super-admin/support.schema.ts:54-58,
 * src/modules/super-admin/support.service.ts:387-408, src/modules/billing/billing.service.ts:421-475.
 */
test.describe('TG-HP-310 — Cancelar suscripción (destructiva)', () => {
  test('active → canceled, exige nombre exacto + motivo ≥3 chars', async ({ browser }) => {
    await runSql(
      `
      INSERT INTO tenant_subscriptions
        (tenant_id, plan_id, billing_cycle, status, current_period_start, current_period_end,
         mp_subscription_id, canceled_at, cancellation_reason)
      SELECT $1, id, 'monthly', 'active', NOW(), NOW() + INTERVAL '30 days', NULL, NULL, NULL
      FROM plans WHERE slug = 'predio'
      ON CONFLICT (tenant_id) DO UPDATE SET
        status = 'active',
        mp_subscription_id = NULL,
        canceled_at = NULL,
        cancellation_reason = NULL,
        updated_at = NOW()
      `,
      [E2E_TENANT_ID],
    )
    await runSql(`UPDATE tenants SET status = 'active' WHERE id = $1`, [E2E_TENANT_ID])

    const tenantRowBefore = (
      await runSql<{ name: string }>('SELECT name FROM tenants WHERE id = $1', [E2E_TENANT_ID])
    )[0]!
    const reason = 'Solicitado por el dueño vía soporte telefónico (QA TG-HP-310).'

    const ctx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    // Caso de plata: no se limpia la fila final (canceled) en finally.
    try {
      const page = await ctx.newPage()
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}?tab=acciones`)

      await expect(page.getByRole('heading', { name: 'Cancelar suscripción' })).toBeVisible({
        timeout: 15_000,
      })

      const cancelBtn = page.getByRole('button', { name: 'Cancelar suscripción' })
      await expect(cancelBtn).toBeDisabled() // sin motivo ni nombre

      const reasonInput = page.locator('#cancel-reason')
      await reasonInput.fill('ab') // < 3 chars
      await expect(cancelBtn).toBeDisabled()
      await reasonInput.fill(reason)

      const confirmInput = page.locator('#cancel-confirm')
      await expect(
        page.getByText(
          `Acción destructiva. Escribí el nombre exacto del complejo (${tenantRowBefore.name}) para confirmar:`,
        ),
      ).toBeVisible()
      await confirmInput.fill('nombre incorrecto')
      await expect(cancelBtn).toBeDisabled()

      await confirmInput.fill(tenantRowBefore.name)
      await expect(cancelBtn).toBeEnabled()

      await cancelBtn.click()

      await expect(
        page.getByText(/^Suscripción cancelada\. Acceso hasta \d{4}-\d{2}-\d{2}\.$/),
      ).toBeVisible({ timeout: 10_000 })
      expect(page.url()).toContain('?tab=acciones')
      await expect(page.getByText(/Estado actual: Cancelado\./)).toBeVisible()

      // ── DB ────────────────────────────────────────────────────────────
      const tenantRow = (
        await runSql<{ status: string }>('SELECT status FROM tenants WHERE id = $1', [
          E2E_TENANT_ID,
        ])
      )[0]!
      const subRow = (
        await runSql<{
          status: string
          canceled_at: string | null
          cancellation_reason: string | null
          current_period_end: string
        }>(
          `SELECT status, canceled_at, cancellation_reason, current_period_end
           FROM tenant_subscriptions WHERE tenant_id = $1`,
          [E2E_TENANT_ID],
        )
      )[0]!
      expect(tenantRow.status).toBe('canceled')
      expect(subRow.status).toBe('canceled')
      expect(subRow.canceled_at).not.toBeNull()
      expect(subRow.cancellation_reason).toBe(reason)

      await writeEvidence('TG-HP-310', {
        status: 'pass',
        tenantRow,
        tenantSubscriptionRow: subRow,
        confirmedName: tenantRowBefore.name,
        reason,
        dbWrites: 'tenants.status, tenant_subscriptions.status/canceled_at/cancellation_reason (lifecycle.service.ts:271-302) + audit_logs',
        notes:
          'CASO DE PLATA: fila final (canceled) queda viva para el verificador. Probado con motivo <3 chars ' +
          'y nombre incorrecto primero (botón sigue disabled en ambos casos).',
      })
    } finally {
      await ctx.close()
    }
  })
})
