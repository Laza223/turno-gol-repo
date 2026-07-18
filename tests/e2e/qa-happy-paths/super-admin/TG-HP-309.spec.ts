import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'

/**
 * TG-HP-309 — Cambiar plan (`changePlanAction`, valida límite de canchas).
 * Rol: Super-admin (system_admin). CASO DE PLATA / FSM — NO se limpia la fila
 * final (queda viva para verificadores).
 *
 * Fixture sembrado con runSql: suscripción `active` en plan 'predio' (max_courts=2,
 * migr. 043) + `tenants.status='active'`. El tenant Demo tiene 1 cancha `online`
 * (seed-e2e.ts) → cabe en cualquiera de los 3 planes, incluido el destino 'complejo'
 * (max_courts=5). `mp_subscription_id` queda NULL a propósito: la rama de MP
 * (`gateway.updatePreapprovalAmount`) no se ejerce en este happy path (manual §TG-HP-309).
 * Evidence anchors: .../_components/support-actions/ChangePlanSection.tsx:27-85,
 * .../actions.ts:185-204, src/modules/super-admin/support.schema.ts:49-52,
 * src/modules/super-admin/support.service.ts:321-383.
 */
test.describe('TG-HP-309 — Cambiar plan sin cobro', () => {
  test('predio → complejo, valida canchas online ≤ max_courts destino', async ({ browser }) => {
    await runSql(
      `
      INSERT INTO tenant_subscriptions
        (tenant_id, plan_id, billing_cycle, status, current_period_start, current_period_end, mp_subscription_id)
      SELECT $1, id, 'monthly', 'active', NOW(), NOW() + INTERVAL '30 days', NULL
      FROM plans WHERE slug = 'predio'
      ON CONFLICT (tenant_id) DO UPDATE SET
        plan_id = (SELECT id FROM plans WHERE slug = 'predio'),
        status = 'active',
        mp_subscription_id = NULL,
        updated_at = NOW()
      `,
      [E2E_TENANT_ID],
    )
    await runSql(`UPDATE tenants SET status = 'active' WHERE id = $1`, [E2E_TENANT_ID])

    const onlineCourts = (
      await runSql<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM courts WHERE tenant_id = $1 AND status = 'online'`,
        [E2E_TENANT_ID],
      )
    )[0]!.n

    const ctx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    // Caso de plata: no se limpia la fila final (plan complejo) en finally.
    try {
      const page = await ctx.newPage()
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}?tab=acciones`)

      await expect(page.getByRole('heading', { name: 'Cambiar plan sin cobro' })).toBeVisible({
        timeout: 15_000,
      })

      const select = page.locator('#target-plan')
      // El plan actual (Predio) está excluido de las opciones (ChangePlanSection.tsx:62).
      await expect(select.locator('option', { hasText: 'Predio' })).toHaveCount(0)
      const complejoOption = select.locator('option').filter({ hasText: 'Complejo' })
      const complejoValue = await complejoOption.getAttribute('value')
      expect(complejoValue).toBeTruthy()

      const changeBtn = page.getByRole('button', { name: 'Cambiar plan' })
      await expect(changeBtn).toBeDisabled() // sin plan elegido

      await select.selectOption(complejoValue!)
      await expect(changeBtn).toBeEnabled()
      await changeBtn.click()

      await expect(page.getByText('Plan cambiado sin cobro.')).toBeVisible({ timeout: 10_000 })
      expect(page.url()).toContain('?tab=acciones')

      // ── DB ────────────────────────────────────────────────────────────
      const subRow = (
        await runSql<{ plan_slug: string; plan_name: string }>(
          `SELECT p.slug AS plan_slug, p.name AS plan_name
           FROM tenant_subscriptions ts JOIN plans p ON p.id = ts.plan_id
           WHERE ts.tenant_id = $1`,
          [E2E_TENANT_ID],
        )
      )[0]!
      expect(subRow.plan_slug).toBe('complejo')

      const auditRow = (
        await runSql<{ metadata: unknown }>(
          `SELECT metadata FROM audit_logs
           WHERE tenant_id = $1 AND action = 'support.tenant.plan_changed'
           ORDER BY created_at DESC LIMIT 1`,
          [E2E_TENANT_ID],
        )
      )[0]

      await writeEvidence('TG-HP-309', {
        status: 'pass',
        onlineCourtsAtFixtureTime: Number(onlineCourts),
        subscriptionPlanAfter: subRow,
        latestPlanChangedAuditLog: auditRow ?? null,
        dbWrites: 'tenant_subscriptions.plan_id/pending_plan_change (support.service.ts:358-365) + audit_logs',
        notes:
          'CASO DE PLATA: plan Complejo queda vivo para el verificador. mp_subscription_id=NULL → rama MP no ejercida.',
      })
    } finally {
      await ctx.close()
    }
  })
})
