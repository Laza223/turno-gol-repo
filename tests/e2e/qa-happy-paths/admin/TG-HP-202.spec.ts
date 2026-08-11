import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { writeEvidence, runSql } from '../_qa/evidence'
import { makeServiceClient } from '../../_helpers/booking-seed'

/**
 * TG-HP-202 — Register dueño nuevo.
 * Rol: Admin (dueño) — el registro siempre crea staff_users SIN tenant.
 * Prereq: sin sesión, email nuevo (no presente en staff_users).
 * Flujo: /register → fill firstName/lastName/email/phone/password/confirmPassword
 *   → Crear cuenta → estado "Confirmá tu email" (mismo componente, sin redirect).
 * El resto del flujo (click en el link de Inbucket, login, /onboarding) es
 * "fuera de la UI" por diseño del manual — no hay harness de Inbucket en este
 * repo de e2e, así que el caso cierra en el estado ConfirmState.
 * Evidence anchors: src/app/(auth)/register/actions.ts:16-28,38-109,
 *   RegisterCard.tsx:52-119,121-143.
 */
test.describe('TG-HP-202 — Register dueño nuevo', () => {
  test('new owner registration renders the confirm-your-email state + creates unconfirmed Auth user', async ({
    page,
  }) => {
    const uniq = randomUUID().slice(0, 8)
    const email = `e2e-qa-register-${uniq}@turnogol.test`
    let authUserId: string | null = null

    try {
      // Step 1: /register.
      await page.goto('/register')
      await expect(page.getByRole('heading', { name: /Creá tu cuenta/i })).toBeVisible()

      // Step 2: mock data en los 6 campos.
      await page.locator('#firstName').fill('E2E')
      await page.locator('#lastName').fill('QaRegister')
      await page.locator('#email').fill(email)
      await page.locator('#phone').fill('1122334455')
      await page.locator('#password').fill('e2e-Qa-Register-Pass1')
      await page.locator('#confirmPassword').fill('e2e-Qa-Register-Pass1')

      // Step 3: submit.
      await page.getByRole('button', { name: /^Crear cuenta$/i }).click()

      // Step 4: ConfirmState — mismo componente, sin redirect.
      await expect(page.getByRole('heading', { name: /Confirmá tu email/i })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(email)).toBeVisible()

      // DB: signUpStaff crea el usuario en Supabase Auth (unconfirmed);
      // staff_users NO se puebla todavía (recién en el primer login post-confirmación).
      const authRows = await runSql<{ id: string; email_confirmed_at: string | null }>(
        'SELECT id, email_confirmed_at FROM auth.users WHERE email = $1',
        [email],
      )
      expect(authRows).toHaveLength(1)
      expect(authRows[0]?.email_confirmed_at).toBeNull()
      authUserId = authRows[0]?.id ?? null

      const staffRows = await runSql<{ id: string }>(
        'SELECT id FROM staff_users WHERE email = $1',
        [email],
      )
      expect(staffRows).toHaveLength(0)

      await writeEvidence('TG-HP-202', {
        status: 'pass',
        email,
        authUserRow: authRows[0],
        staffUsersRowCount: staffRows.length,
        dbWrites:
          'auth.users (unconfirmed) via signUpStaff; staff_users NO se crea hasta el primer login',
        notes:
          'Confirmación de email + login + /onboarding quedan fuera de la UI (manual explícito, sin harness Inbucket en este repo).',
      })
    } finally {
      // Cleanup: borra el usuario de Supabase Auth creado por el registro real.
      if (authUserId) {
        const supabase = makeServiceClient()
        const { error } = await supabase.auth.admin.deleteUser(authUserId)
        if (error && !/not found/i.test(error.message)) {
          console.warn(`[TG-HP-202] cleanup deleteUser failed: ${error.message}`)
        }
      }
      await runSql('DELETE FROM staff_users WHERE email = $1', [email])
    }
  })
})
