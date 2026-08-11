import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'

/**
 * TG-HP-308 — Extender trial (`extendTrialAction`, 1–90 días).
 * Rol: Super-admin (system_admin). CASO DE PLATA / FSM — NO se limpia la fila
 * final (queda viva para verificadores).
 *
 * El tenant Demo del seed E2E nace `active` y `'trialing'` no es alcanzable
 * como destino vía `forceTenantStatusAction` (no aparece en ningún array de
 * FORCEABLE_TRANSITIONS) — fixture SQL directo requerido (manual §TG-HP-308).
 * `extendTrial` solo toca `tenants` (no depende de `tenant_subscriptions`),
 * así que el fixture no toca esa tabla.
 * Evidence anchors: .../_components/support-actions/ExtendTrialSection.tsx:17-61,
 * .../actions.ts:162-181, src/modules/super-admin/support.schema.ts:27-30,
 * src/modules/super-admin/support.service.ts:190-220.
 */
test.describe('TG-HP-308 — Extender trial', () => {
  test('trialing: extender N días mueve trial_ends_at a max(hoy, fin actual) + N', async ({
    browser,
  }) => {
    await runSql(
      `UPDATE tenants SET status = 'trialing', trial_ends_at = NOW() + INTERVAL '3 days' WHERE id = $1`,
      [E2E_TENANT_ID],
    )
    const before = (
      await runSql<{ trial_ends_at: string }>('SELECT trial_ends_at FROM tenants WHERE id = $1', [
        E2E_TENANT_ID,
      ])
    )[0]!
    const originalTrialEnd = new Date(before.trial_ends_at)

    const ctx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    // Caso de plata: no se limpia la fila final (trial_ends_at extendido) en finally.
    try {
      const page = await ctx.newPage()
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}?tab=acciones`)

      await expect(page.getByRole('heading', { name: 'Extender trial' })).toBeVisible({
        timeout: 15_000,
      })
      const daysInput = page.locator('#trial-days')
      await expect(daysInput).toHaveValue('7') // default

      const days = 14
      await daysInput.fill(String(days))
      await page.getByRole('button', { name: 'Extender trial' }).click()

      const feedback = page.getByText(/^Trial extendido 14 días \(vence \d{4}-\d{2}-\d{2}\)\.$/)
      await expect(feedback).toBeVisible({ timeout: 10_000 })
      expect(page.url()).toContain('?tab=acciones')

      // ── DB ────────────────────────────────────────────────────────────
      const after = (
        await runSql<{ trial_ends_at: string; status: string }>(
          'SELECT trial_ends_at, status FROM tenants WHERE id = $1',
          [E2E_TENANT_ID],
        )
      )[0]!
      const newTrialEnd = new Date(after.trial_ends_at)
      const expected = new Date(originalTrialEnd.getTime() + days * 24 * 60 * 60 * 1000)

      expect(after.status).toBe('trialing')
      // Tolerancia de 60s por el tiempo transcurrido entre el fixture y la action.
      expect(Math.abs(newTrialEnd.getTime() - expected.getTime())).toBeLessThan(60_000)

      await writeEvidence('TG-HP-308', {
        status: 'pass',
        originalTrialEnd: originalTrialEnd.toISOString(),
        newTrialEnd: newTrialEnd.toISOString(),
        daysExtended: days,
        dbWrites:
          'tenants.trial_ends_at (support.service.ts:190-220) + audit_logs support.tenant.trial_extended',
        notes: 'CASO DE PLATA: trial_ends_at extendido queda vivo para el verificador.',
      })
    } finally {
      await ctx.close()
    }
  })
})
