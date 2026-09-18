import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'

/**
 * TG-HP-309 — Corregir canchas facturadas (`changeBilledCourtsAction`, valida
 * el piso de canchas online). Rol: Super-admin (system_admin). CASO DE PLATA /
 * FSM — NO se limpia la fila final (queda viva para verificadores).
 *
 * Desde el precio por cancha (decisión 2026-09-17) no hay plan que elegir:
 * `plans` tiene una sola fila activa y lo que se corrige es
 * `tenant_subscriptions.billed_courts`. Fixture: suscripción `active` sobre la
 * fila lineal con `billed_courts = 1` + `tenants.status='active'`. El tenant
 * Demo tiene 1 cancha `online` (seed-e2e.ts), así que subir a 2 es válido y
 * bajar a 0 no existe. `mp_subscription_id` queda NULL a propósito: la rama de
 * MP (`gateway.updatePreapprovalAmount`) no se ejerce en este happy path.
 * Evidence anchors: .../_components/support-actions/BilledCourtsSection.tsx,
 * .../actions.ts (changeBilledCourtsAction), src/modules/super-admin/support.schema.ts,
 * src/modules/super-admin/support.service.ts (changeBilledCourtsForSupport).
 */
test.describe('TG-HP-309 — Corregir canchas facturadas sin cobro', () => {
  test('1 → 2 canchas facturadas, con el monto nuevo visible antes de confirmar', async ({
    browser,
  }) => {
    await runSql(
      `
      INSERT INTO tenant_subscriptions
        (tenant_id, plan_id, billing_cycle, status, billed_courts,
         current_period_start, current_period_end, mp_subscription_id)
      SELECT $1, id, 'monthly', 'active', 1, NOW(), NOW() + INTERVAL '30 days', NULL
      FROM plans WHERE is_active = true ORDER BY sort_order LIMIT 1
      ON CONFLICT (tenant_id) DO UPDATE SET
        plan_id = (SELECT id FROM plans WHERE is_active = true ORDER BY sort_order LIMIT 1),
        status = 'active',
        billed_courts = 1,
        pending_billed_courts = NULL,
        pending_change_at = NULL,
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
    // Caso de plata: no se limpia la fila final (2 canchas) en finally.
    try {
      const page = await ctx.newPage()
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}?tab=acciones`)

      await expect(page.getByRole('heading', { name: 'Corregir canchas facturadas' })).toBeVisible({
        timeout: 15_000,
      })

      const input = page.locator('#billed-courts')
      await expect(input).toHaveValue('1')

      const changeBtn = page.getByRole('button', { name: 'Corregir canchas' })
      await expect(changeBtn).toBeDisabled() // sin cambio no hay nada que confirmar

      await input.fill('2')
      await expect(changeBtn).toBeEnabled()
      await changeBtn.click()

      // El diálogo dice el monto viejo y el nuevo antes de ejecutar nada.
      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText(/de 1 cancha/i)
      await expect(dialog).toContainText(/a 2 canchas/i)
      await dialog.getByRole('button', { name: 'Confirmar cambio' }).click()

      await expect(page.getByText('Canchas facturadas corregidas, sin cobro.')).toBeVisible({
        timeout: 10_000,
      })
      expect(page.url()).toContain('?tab=acciones')

      // ── DB ────────────────────────────────────────────────────────────
      const subRow = (
        await runSql<{ billed_courts: number; plan_slug: string }>(
          `SELECT ts.billed_courts, p.slug AS plan_slug
           FROM tenant_subscriptions ts JOIN plans p ON p.id = ts.plan_id
           WHERE ts.tenant_id = $1`,
          [E2E_TENANT_ID],
        )
      )[0]!
      expect(Number(subRow.billed_courts)).toBe(2)

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
        subscriptionAfter: subRow,
        latestPlanChangedAuditLog: auditRow ?? null,
        dbWrites: 'tenant_subscriptions.billed_courts (support.service.ts) + audit_logs',
        notes:
          'CASO DE PLATA: la suscripción queda en 2 canchas facturadas para el verificador. mp_subscription_id=NULL → rama MP no ejercida.',
      })
    } finally {
      await ctx.close()
    }
  })
})
