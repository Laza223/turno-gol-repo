import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { newAuthedContext, QA_EMAILS } from '../_qa/session'
import { E2E_TENANT_ID } from '../../_helpers/booking-seed'

/**
 * TG-HP-312 — Reset password de un staff (`resetStaffPasswordAction`).
 * Rol: Super-admin (system_admin). Prereq: staff activo del tenant (E2E Admin,
 * QA_EMAILS.admin). No se tipea la password generada (regla del contrato QA):
 * se valida el resultado de la action (mensaje inline con formato `TG-<hex10>`)
 * + el efecto real en `auth.users.raw_app_meta_data.force_password_change` y
 * en `audit_logs`.
 *
 * Cleanup obligatorio en finally: `force_password_change=true` es un claim del
 * JWT (auth.middleware.ts:46) que el layout admin usa para forzar `/reset-password`
 * (src/app/(admin)/layout.tsx:55) en CUALQUIER sesión futura de ese email — incluida
 * la que mintea `newAuthedContext(browser, QA_EMAILS.admin)` en otros specs. Se
 * restaura a `null` (mismo valor que usa el flujo real al completar el cambio,
 * reset-password/actions.ts:58) para no romper specs de la banda admin si se
 * re-ejecutan sueltos contra esta misma DB.
 * Evidence anchors: .../_components/support-actions/ResetPasswordSection.tsx:16-57,
 * .../actions.ts:267-374, src/app/(auth)/login/actions.ts:76-79,
 * src/app/(admin)/layout.tsx:52-55.
 */
test.describe('TG-HP-312 — Reset password de staff', () => {
  test('genera password temporal TG-<hex> + force_password_change=true + audita', async ({
    browser,
  }) => {
    const ctx = await newAuthedContext(browser, QA_EMAILS.superadmin)
    try {
      const page = await ctx.newPage()
      await page.goto(`/super-admin/tenants/${E2E_TENANT_ID}?tab=acciones`)

      await expect(
        page.getByRole('heading', { name: 'Resetear contraseña de staff' }),
      ).toBeVisible({ timeout: 15_000 })

      const resetBtn = page.getByRole('button', { name: 'Resetear contraseña' })
      await expect(resetBtn).toBeDisabled() // email vacío

      await page.locator('#reset-email').fill(QA_EMAILS.admin)
      await expect(resetBtn).toBeEnabled()
      await resetBtn.click()

      const feedback = page.getByText(
        /^Contraseña temporal: TG-[0-9a-f]{10} — dictásela al titular\. Deberá cambiarla al entrar\.$/,
      )
      await expect(feedback).toBeVisible({ timeout: 10_000 })
      expect(page.url()).toContain('?tab=acciones')
      const feedbackText = (await feedback.textContent())!
      const tempPassword = feedbackText.match(/TG-[0-9a-f]{10}/)![0]

      // ── DB ────────────────────────────────────────────────────────────
      const authRow = (
        await runSql<{ force_password_change: unknown }>(
          `SELECT raw_app_meta_data->>'force_password_change' AS force_password_change
           FROM auth.users WHERE email = $1`,
          [QA_EMAILS.admin],
        )
      )[0]!
      expect(authRow.force_password_change).toBe('true')

      const auditRow = (
        await runSql<{ metadata: { staff_email?: string } }>(
          `SELECT metadata FROM audit_logs
           WHERE tenant_id = $1 AND action = 'support.user.password_reset'
           ORDER BY created_at DESC LIMIT 1`,
          [E2E_TENANT_ID],
        )
      )[0]
      expect(auditRow?.metadata?.staff_email).toBe(QA_EMAILS.admin)

      await writeEvidence('TG-HP-312', {
        status: 'pass',
        staffEmail: QA_EMAILS.admin,
        tempPasswordFormat: tempPassword.replace(/[0-9a-f]{10}$/, '<redacted>'),
        forcePasswordChangeAfter: authRow.force_password_change,
        latestPasswordResetAuditLog: auditRow ?? null,
        dbWrites:
          'auth.users.raw_app_meta_data.force_password_change (Supabase Admin API updateUserById) + audit_logs support.user.password_reset',
        notes:
          'Password temporal NO se tipeó en ningún form; se validó vía el mensaje de feedback + el efecto en DB. ' +
          'force_password_change restaurado a null en finally (evita romper specs de la banda admin que reusan e2e-admin@turnogol.test).',
      })
    } finally {
      await ctx.close()
      // Restaura force_password_change: e2e-admin@turnogol.test es una fixture
      // compartida cross-banda (usada por adminStorageState en tests/e2e/fixtures.ts).
      await runSql(
        `UPDATE auth.users
         SET raw_app_meta_data = raw_app_meta_data || '{"force_password_change": null}'::jsonb
         WHERE email = $1`,
        [QA_EMAILS.admin],
      )
    }
  })
})
