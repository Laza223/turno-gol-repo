import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'

/**
 * TG-HP-311 — Editar settings de soporte (`updateTenantSettingsAction`, campos
 * whitelisteados).
 * Rol: Super-admin (system_admin). Prereq: tenant Demo (no depende de
 * tenant_subscriptions). No es un caso FSM — no hace falta preservar la fila,
 * pero tampoco se necesita ninguna limpieza especial: solo cambia 2 campos
 * whitelisteados de forma determinística (valores nuevos != actuales, leídos
 * primero de DB).
 * Evidence anchors: .../_components/support-actions/SettingsSection.tsx:24-119,
 * .../actions.ts:243-263, src/modules/super-admin/support.schema.ts:65-90,
 * src/modules/super-admin/support.service.ts:412-439.
 */
test.describe('TG-HP-311 — Editar settings de soporte', () => {
  test('cambiar % de seña + anticipación (whitelist, lee-mergea-escribe sobre tenants.settings)', async ({
    browser,
  }) => {
    const before = (
      await runSql<{ settings: Record<string, unknown> }>(
        'SELECT settings FROM tenants WHERE id = $1',
        [E2E_TENANT_ID],
      )
    )[0]!
    const currentAdvanceDays = Number(before.settings.booking_advance_days ?? 6)
    const currentRequiresDeposit = Boolean(before.settings.requires_deposit ?? false)
    const newAdvanceDays = currentAdvanceDays === 10 ? 15 : 10
    const newRequiresDeposit = !currentRequiresDeposit

    const ctx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    try {
      const page = await ctx.newPage()
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}?tab=acciones`)

      await expect(page.getByRole('heading', { name: 'Editar settings del complejo' })).toBeVisible(
        { timeout: 15_000 },
      )

      const advanceInput = page.locator('#advance-days')
      await expect(advanceInput).toHaveValue(String(currentAdvanceDays))
      await advanceInput.fill(String(newAdvanceDays))

      const depositCheckbox = page.getByLabel('Requiere seña')
      const wasChecked = await depositCheckbox.isChecked()
      expect(wasChecked).toBe(currentRequiresDeposit)
      await depositCheckbox.setChecked(newRequiresDeposit)

      await page.getByRole('button', { name: 'Guardar settings' }).click()

      await expect(page.getByText('Settings actualizados.')).toBeVisible({ timeout: 10_000 })
      expect(page.url()).toContain('?tab=acciones')

      // ── DB ────────────────────────────────────────────────────────────
      const after = (
        await runSql<{ settings: Record<string, unknown> }>(
          'SELECT settings FROM tenants WHERE id = $1',
          [E2E_TENANT_ID],
        )
      )[0]!
      expect(Number(after.settings.booking_advance_days)).toBe(newAdvanceDays)
      expect(Boolean(after.settings.requires_deposit)).toBe(newRequiresDeposit)

      const auditRow = (
        await runSql<{ metadata: unknown }>(
          `SELECT metadata FROM audit_logs
           WHERE tenant_id = $1 AND action = 'support.tenant.settings_updated'
           ORDER BY created_at DESC LIMIT 1`,
          [E2E_TENANT_ID],
        )
      )[0]

      await writeEvidence('TG-HP-311', {
        status: 'pass',
        before: { advanceDays: currentAdvanceDays, requiresDeposit: currentRequiresDeposit },
        after: { advanceDays: newAdvanceDays, requiresDeposit: newRequiresDeposit },
        settingsAfter: after.settings,
        latestSettingsAuditLog: auditRow ?? null,
        dbWrites:
          'tenants.settings (lee-mergea-escribe, support.service.ts:412-439) + audit_logs support.tenant.settings_updated',
        notes:
          'z.strictObject rechaza campos no whitelisteados — no se probó ese rechazo (fuera del happy path).',
      })
    } finally {
      await ctx.close()
    }
  })
})
