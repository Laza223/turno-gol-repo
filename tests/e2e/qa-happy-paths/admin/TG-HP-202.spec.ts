import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { writeEvidence, runSql, getSql } from '../_qa/evidence'
import { makeServiceClient } from '../../_helpers/booking-seed'
import { deleteFreshAdminTenants } from '../../_helpers/fresh-tenant-cleanup'
import { answerComplexQuestions, createAccountWithMail } from '../../_helpers/public-signup'

/**
 * TG-HP-202 — Alta pública: dueño nuevo, complejo primero y cuenta al final.
 * Rol: Admin (dueño). Sin sesión, mail nuevo (no presente en staff_users).
 * Flujo: /register → nombre, dirección, canchas, horarios, precio y 3 toques → "Último paso:
 *   tu cuenta" → celular + "Continuar con email" → "Crear mi cuenta" → crea cuenta, complejo y
 *   canchas de una vez y entra a /onboarding/listo, sin confirmar el mail. La cuenta de Auth
 *   nace confirmada y `staff_users.email_verified_at` queda NULL hasta que toque el link propio.
 * Google no se recorre acá: el OAuth es de un tercero.
 * Evidence anchors: src/app/(auth)/register/{SignupFlow,StepCuenta,actions}.tsx, signup.service.ts.
 */
test.describe('TG-HP-202 — Alta pública del dueño', () => {
  test('new owner signs up complex-first and lands on listo with an unverified mail', async ({
    page,
  }) => {
    const uniq = randomUUID().slice(0, 8)
    const email = `e2e-qa-register-${uniq}@turnogol.test`
    const complexName = `Complejo E2E QA-202 ${uniq}`
    let authUserId: string | null = null

    try {
      await answerComplexQuestions(page, complexName)
      await createAccountWithMail(page, {
        name: 'E2E',
        email,
        phone: '1122334455',
        password: 'e2e-Qa-Register-Pass1',
      })
      await page.waitForURL(/\/onboarding\/listo/, { timeout: 20_000 })

      // El borrador se limpia tras el éxito y nunca guardó la contraseña.
      expect(await page.evaluate(() => localStorage.getItem('tg_signup_draft'))).toBeNull()

      const authRows = await runSql<{ id: string; email_confirmed_at: string | null }>(
        'SELECT id, email_confirmed_at FROM auth.users WHERE email = $1',
        [email],
      )
      expect(authRows).toHaveLength(1)
      expect(authRows[0]?.email_confirmed_at).not.toBeNull()
      authUserId = authRows[0]?.id ?? null

      const staffRows = await runSql<{ id: string; email_verified_at: string | null }>(
        'SELECT id, email_verified_at FROM staff_users WHERE email = $1',
        [email],
      )
      expect(staffRows).toHaveLength(1)
      expect(staffRows[0]?.email_verified_at).toBeNull()

      const tenantRows = await runSql<{ id: string; settings: { onboarding_completed?: boolean } }>(
        `SELECT t.id, t.settings FROM tenants t
           JOIN tenant_staff_members tsm ON tsm.tenant_id = t.id
          WHERE tsm.staff_user_id = $1 AND t.name = $2`,
        [staffRows[0]?.id, complexName],
      )
      expect(tenantRows).toHaveLength(1)
      expect(tenantRows[0]?.settings.onboarding_completed).toBe(true)
      const courtRows = await runSql<{ name: string }>(
        'SELECT name FROM courts WHERE tenant_id = $1',
        [tenantRows[0]?.id],
      )
      expect(courtRows.map((c) => c.name)).toEqual(['Cancha 1'])

      await writeEvidence('TG-HP-202', {
        status: 'pass',
        email,
        authUserRow: authRows[0],
        tenantRow: tenantRows[0],
        courtCount: courtRows.length,
        dbWrites:
          'auth.users (confirmado) + staff_users (email_verified_at NULL) + tenants + tenant_staff_members + courts, en una sola Server Action',
        notes:
          'El link de verificación propio (/api/auth/verify-email) no se recorre acá: el token solo viaja en el mail.',
      })
    } finally {
      const staff = await runSql<{ id: string }>('SELECT id FROM staff_users WHERE email = $1', [
        email,
      ])
      const sql = getSql()
      try {
        if (staff[0]) await deleteFreshAdminTenants(sql, staff[0].id)
      } finally {
        await sql.end({ timeout: 5 })
      }
      if (authUserId) {
        const { error } = await makeServiceClient().auth.admin.deleteUser(authUserId)
        if (error && !/not found/i.test(error.message)) {
          console.warn(`[TG-HP-202] cleanup deleteUser failed: ${error.message}`)
        }
      }
      await runSql('DELETE FROM staff_users WHERE email = $1', [email])
    }
  })
})
