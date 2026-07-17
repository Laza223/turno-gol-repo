import { test, expect } from '../../fixtures'
import { writeEvidence, runSql } from '../_qa/evidence'
import { E2E_STAFF_USER_ID, E2E_TENANT_ID } from '../../_helpers/booking-seed'
import { E2E_TEST_PASSWORD } from '../../_helpers/test-credentials'

/**
 * TG-HP-201 — Login staff email+password.
 * Rol: Admin (dueño). Prereq: sin sesión, e2e-admin@turnogol.test ya existe como
 * staff_users con 1 tenant (Demo) vinculado.
 * Flujo: /login → fill #email/#password → Ingresar → redirect /dashboard.
 * No hay escritura de DB en login (provisionAndRouteStaff solo refresca claim si
 * hace falta) — se lee tenant_staff_members.role como evidencia de que el corte
 * de acceso admin sigue intacto post-login.
 * Evidence anchors: src/app/(auth)/login/actions.ts:14,31-83, LoginCard.tsx:36-45,98-102,159-176.
 */
test.describe('TG-HP-201 — Login staff email+password', () => {
  test('valid staff credentials log in and land on /dashboard', async ({ page }) => {
    // Step 1-2: navegar a /login, form component visible.
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /Iniciá sesión/i })).toBeVisible()
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()

    // Step 3-4: credenciales del fixture + submit.
    await page.locator('#email').fill('e2e-admin@turnogol.test')
    await page.locator('#password').fill(E2E_TEST_PASSWORD)
    await page.getByRole('button', { name: /^Ingresar$/i }).click()

    // Step 5: redirect real (Next redirect(), no toast) a /dashboard.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
    await expect(page.getByText(/E2E Complejo Demo/i).first()).toBeVisible({ timeout: 10_000 })

    // DB: login no muta staff_users/tenant_staff_members — se lee el rol para
    // confirmar que el corte de acceso admin post-login sigue como lo dejó el seed.
    const rows = await runSql<{ role: string }>(
      'SELECT role FROM tenant_staff_members WHERE tenant_id = $1 AND staff_user_id = $2',
      [E2E_TENANT_ID, E2E_STAFF_USER_ID],
    )
    expect(rows[0]?.role).toBe('admin')

    await writeEvidence('TG-HP-201', {
      status: 'pass',
      finalUrl: page.url(),
      dbRow: rows[0],
      dbWrites: 'none (login no muta staff_users; ver actions.ts:191-227 provisionAndRouteStaff)',
      notes: 'Éxito = redirect() server-side de Next, no hay toast ni revalidatePath.',
    })
  })
})
