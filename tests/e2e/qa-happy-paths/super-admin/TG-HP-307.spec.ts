import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'

/**
 * TG-HP-307 — Reactivar tenant (`reactivateTenantAction`).
 * Rol: Super-admin (system_admin). CASO DE PLATA / FSM — NO se limpia la fila
 * final (queda viva para verificadores y para TG-HP-308/309/310, que parten
 * de un tenant 'active' con suscripción).
 *
 * Fixture sembrado con runSql, independiente de TG-HP-306: `tenant_subscriptions`
 * en 'blocked' (uno de los `REACTIVATABLE_STATUSES`, support.service.ts:103-109)
 * CON fila presente (si no, `SubscriptionNotFoundError`) + `tenants.status='blocked'`.
 * `transitionToActiveFromAny` no exige gate temporal, solo status IN (...).
 * Evidence anchors: .../_components/support-actions/ReactivateSection.tsx:16-37,
 * .../page.tsx:169-171, .../actions.ts:144-158,
 * src/modules/super-admin/support.service.ts:102-109,282-305.
 */
test.describe('TG-HP-307 — Reactivar tenant', () => {
  test('blocked → active, limpia dunning/cancelación y resetea el período', async ({ browser }) => {
    await runSql(
      `
      INSERT INTO tenant_subscriptions
        (tenant_id, plan_id, billing_cycle, status, current_period_start, current_period_end,
         dunning_started_at, canceled_at, cancellation_reason, scheduled_deletion_at)
      SELECT $1, id, 'monthly', 'blocked', NOW() - INTERVAL '30 days', NOW() - INTERVAL '5 days',
             NOW() - INTERVAL '20 days', NOW() - INTERVAL '10 days', 'fixture TG-HP-307', NOW() + INTERVAL '5 days'
      FROM plans WHERE slug = 'predio'
      ON CONFLICT (tenant_id) DO UPDATE SET
        status = 'blocked',
        dunning_started_at = NOW() - INTERVAL '20 days',
        canceled_at = NOW() - INTERVAL '10 days',
        cancellation_reason = 'fixture TG-HP-307',
        scheduled_deletion_at = NOW() + INTERVAL '5 days',
        updated_at = NOW()
      `,
      [E2E_TENANT_ID],
    )
    await runSql(`UPDATE tenants SET status = 'blocked' WHERE id = $1`, [E2E_TENANT_ID])

    const beforeSub = (
      await runSql<{ current_period_end: string }>(
        'SELECT current_period_end FROM tenant_subscriptions WHERE tenant_id = $1',
        [E2E_TENANT_ID],
      )
    )[0]!

    const ctx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    // Caso de plata: no se limpia la fila final (active) en finally.
    try {
      const page = await ctx.newPage()
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}?tab=acciones`)

      // canReactivate = subscription!==null && REACTIVATABLE_STATUSES.includes('blocked') → true
      await expect(page.getByRole('heading', { name: 'Reactivar complejo' })).toBeVisible({
        timeout: 15_000,
      })
      const reactivateBtn = page.getByRole('button', { name: 'Reactivar' })
      await expect(reactivateBtn).toBeEnabled() // sin confirmación de nombre — "acción de rescate"

      await reactivateBtn.click()

      await expect(page.getByText("Complejo reactivado (estaba 'blocked').")).toBeVisible({
        timeout: 10_000,
      })
      expect(page.url()).toContain('?tab=acciones')
      await expect(page.getByText(/Estado actual: Activo\./)).toBeVisible()

      // ── DB ────────────────────────────────────────────────────────────
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
      expect(tenantRow.status).toBe('active')
      expect(tenantRow.scheduled_deletion_at).toBeNull()
      expect(subRow.status).toBe('active')
      expect(subRow.dunning_started_at).toBeNull()
      expect(subRow.canceled_at).toBeNull()
      expect(subRow.cancellation_reason).toBeNull()
      // Ventana de período nueva: +30d (monthly) desde ahora.
      expect(new Date(subRow.current_period_end as string).getTime()).toBeGreaterThan(
        new Date(beforeSub.current_period_end).getTime(),
      )

      await writeEvidence('TG-HP-307', {
        status: 'pass',
        tenantRow,
        tenantSubscriptionRow: subRow,
        beforeCurrentPeriodEnd: beforeSub.current_period_end,
        dbWrites:
          'tenants.status/scheduled_deletion_at, tenant_subscriptions.status/current_period_*/dunning_started_at/canceled_at/cancellation_reason ' +
          '(transitionToActiveFromAny, lifecycle.service.ts:344-388) + audit_logs',
        notes:
          'CASO DE PLATA: fila final (active, con suscripción) queda viva para el verificador y para TG-HP-308/309/310.',
      })
    } finally {
      await ctx.close()
    }
  })
})
